import { DateTime } from "luxon";
import { type InitData } from "./auth.js";
import { adminLink, clientLink, config, inviteLink, webAppUrl } from "./config.js";
import { db } from "./db.js";
import { esc } from "./format.js";
import * as notify from "./notify.js";
import { dayBoundsUtc, type WorkHours } from "./slots.js";
import * as store from "./store.js";
import { type Business, type Role, UserError } from "./store.js";
import { tg } from "./telegram.js";
import { TEMPLATES, type BusinessSettings } from "./templates.js";

export interface Ctx {
  init: InitData;
  now?: Date;
}

interface BizCtx extends Ctx {
  business: Business;
  role: Exclude<Role, null>;
}

type P = Record<string, any>;

const int = (v: unknown, name: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new UserError(`Некорректное поле ${name}`);
  return n;
};
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

function publicBusiness(b: Business) {
  return { id: b.id, slug: b.slug, name: b.name, template: b.template, status: b.status, timezone: b.timezone, settings: b.settings };
}

function links(b: Business) {
  return { client: clientLink(b.slug), admin: adminLink(b.slug), botStart: `https://t.me/${config.botUsername}?start=${b.slug}` };
}

async function catalog(b: Business) {
  const [services, staff, portfolio] = await Promise.all([
    store.listServices(db(), b.id),
    store.listStaff(db(), b.id),
    store.listPortfolio(db(), b.id),
  ]);
  return {
    services: services.map(({ id, title, description, price, price_from, duration_min }) => ({
      id,
      title,
      description,
      price,
      price_from,
      duration_min,
    })),
    staff: staff.map(({ id, name, description }) => ({ id, name, description })),
    portfolio: portfolio.map((p) => ({ id: p.id, caption: p.caption })),
  };
}

// ---------------- методы для всех ----------------

async function boot(ctx: Ctx, p: P) {
  const u = ctx.init.user;
  const me = await store.upsertUser(db(), u);
  const isSuper = config.superadmins.includes(u.id);
  const wanted: string | undefined = str(p.slug, 60) || ctx.init.startParam || undefined;

  let business: Business | null = null;
  if (p.businessId) business = await store.getBusiness(db(), int(p.businessId, "businessId"));
  if (!business && wanted && !wanted.startsWith("inv_")) business = await store.getBusiness(db(), wanted);
  if (!business && me.last_business_id) business = await store.getBusiness(db(), Number(me.last_business_id));

  const adminOf = await store.businessesOfAdmin(db(), u.id);
  const role = business ? await store.roleFor(db(), u.id, business.id, config.superadmins) : null;

  if (business && business.status === "blocked" && !role) {
    return { me: { id: u.id, name: u.first_name, isSuper }, business: null, blocked: true, adminOf: [], templates: tplList() };
  }

  if (business) {
    if (Number(me.last_business_id) !== business.id) {
      await store.setLastBusiness(db(), u.id, business.id);
      tg()
        .setChatMenuButton(u.id, "Записаться", webAppUrl({ b: business.slug }))
        .catch(() => {});
    }
    if (!role) await store.touchClient(db(), business.id, u);
  }

  const [client] = business
    ? await db().query(`select name, phone from clients where business_id = $1 and tg_id = $2`, [business.id, u.id])
    : [];

  return {
    me: { id: u.id, name: u.first_name, isSuper },
    business: business ? { ...publicBusiness(business), ...(await catalog(business)) } : null,
    role,
    client: client ?? null,
    adminOf: adminOf.map((b) => ({ id: b.id, slug: b.slug, name: b.name, role: b.role, emoji: b.settings.emoji })),
    templates: tplList(),
  };
}

const tplList = () => TEMPLATES.map(({ id, title, emoji, pitch }) => ({ id, title, emoji, pitch }));

async function requireBusiness(id: unknown): Promise<Business> {
  const b = await store.getBusiness(db(), int(id, "businessId"));
  if (!b) throw new UserError("Бизнес не найден");
  return b;
}

async function availability(ctx: Ctx, p: P) {
  const b = await requireBusiness(p.businessId);
  return store.availability(db(), {
    business: b,
    serviceId: int(p.serviceId, "serviceId"),
    staffId: p.staffId ? int(p.staffId, "staffId") : null,
    days: Math.min(int(p.days ?? 14, "days"), 62),
    now: ctx.now,
  });
}

async function book(ctx: Ctx, p: P) {
  const b = await requireBusiness(p.businessId);
  const booking = await store.createBooking(db(), {
    business: b,
    serviceId: int(p.serviceId, "serviceId"),
    staffId: p.staffId ? int(p.staffId, "staffId") : null,
    start: str(p.start, 40),
    client: { tgId: ctx.init.user.id, name: str(p.name, 80), phone: str(p.phone, 30) },
    answers: typeof p.answers === "object" && p.answers ? p.answers : {},
    comment: str(p.comment),
    now: ctx.now,
  });
  await notify.onBookingCreated(db(), b, booking);
  return { id: booking.id, starts_at: booking.starts_at };
}

async function myBookings(ctx: Ctx, p: P) {
  const b = await requireBusiness(p.businessId);
  const rows = await store.clientBookings(db(), b.id, ctx.init.user.id);
  return rows.map(({ id, service_title, price, starts_at, ends_at, status, cancelled_by }) => ({
    id,
    service_title,
    price,
    starts_at,
    ends_at,
    status,
    cancelled_by,
  }));
}

async function cancelMy(ctx: Ctx, p: P) {
  const b = await requireBusiness(p.businessId);
  const res = await store.cancelBooking(db(), {
    bookingId: int(p.bookingId, "bookingId"),
    business: b,
    by: "client",
    tgId: ctx.init.user.id,
    now: ctx.now,
  });
  await notify.onBookingCancelled(db(), b, res);
  return { ok: true };
}

// ---------------- методы админа бизнеса ----------------

async function adminOverview(ctx: BizCtx) {
  const b = ctx.business;
  const [stats, services, staff, admins] = await Promise.all([
    store.businessStats(db(), b.id),
    store.listServices(db(), b.id, true),
    store.listStaff(db(), b.id, true),
    db().query(
      `select a.tg_id, a.role, u.first_name, u.username from business_admins a left join users u on u.tg_id = a.tg_id
       where a.business_id = $1 order by a.created_at`,
      [b.id],
    ),
  ]);
  return { business: publicBusiness(b), role: ctx.role, stats, services, staff, admins, links: links(b) };
}

async function adminBookings(ctx: BizCtx, p: P) {
  const tz = ctx.business.timezone;
  const date = str(p.date, 10) || DateTime.now().setZone(tz).toISODate()!;
  const days = Math.min(Math.max(int(p.days ?? 1, "days"), 1), 31);
  const from = dayBoundsUtc(date, tz).from;
  const to = DateTime.fromISO(from).plus({ days }).toUTC().toISO()!;
  return store.bookingsInRange(db(), ctx.business.id, from, to);
}

async function adminCancelBooking(ctx: BizCtx, p: P) {
  const res = await store.cancelBooking(db(), {
    bookingId: int(p.bookingId, "bookingId"),
    business: ctx.business,
    by: "admin",
    tgId: ctx.init.user.id,
  });
  await notify.onBookingCancelled(db(), ctx.business, res);
  return { ok: true };
}

async function adminSetStatus(ctx: BizCtx, p: P) {
  const status = str(p.status, 20);
  if (!["done", "no_show", "confirmed"].includes(status)) throw new UserError("Неизвестный статус");
  await store.setBookingStatus(db(), ctx.business.id, int(p.bookingId, "bookingId"), status as any);
  return { ok: true };
}

async function saveService(ctx: BizCtx, p: P) {
  const s = p.service ?? {};
  const title = str(s.title, 100);
  if (title.length < 2) throw new UserError("Введите название услуги");
  const price = Math.max(0, Math.min(int(s.price ?? 0, "price"), 10_000_000));
  const duration = int(s.duration_min ?? 60, "duration_min");
  if (duration < 5 || duration > 720) throw new UserError("Длительность — от 5 до 720 минут");
  const vals = [title, str(s.description), price, Boolean(s.price_from), duration, s.active !== false, int(s.sort ?? 0, "sort")];
  if (s.id) {
    const rows = await db().query(
      `update services set title=$3, description=$4, price=$5, price_from=$6, duration_min=$7, active=$8, sort=$9
       where id = $1 and business_id = $2 returning *`,
      [int(s.id, "id"), ctx.business.id, ...vals],
    );
    if (!rows.length) throw new UserError("Услуга не найдена");
    return rows[0];
  }
  const [row] = await db().query(
    `insert into services (business_id, title, description, price, price_from, duration_min, active, sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [ctx.business.id, ...vals],
  );
  return row;
}

async function deleteService(ctx: BizCtx, p: P) {
  await db().query(`delete from services where id = $1 and business_id = $2`, [int(p.id, "id"), ctx.business.id]);
  return { ok: true };
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateWorkHours(wh: unknown): WorkHours {
  const out: WorkHours = {};
  if (!wh || typeof wh !== "object") return out;
  for (const [day, intervals] of Object.entries(wh as Record<string, unknown>)) {
    if (!/^[1-7]$/.test(day) || !Array.isArray(intervals)) continue;
    const list: [string, string][] = [];
    for (const it of intervals) {
      if (!Array.isArray(it) || !HM.test(it[0]) || !(HM.test(it[1]) || it[1] === "24:00")) {
        throw new UserError("Время работы в формате ЧЧ:ММ");
      }
      if (it[0] >= it[1]) throw new UserError("Начало смены должно быть раньше конца");
      list.push([it[0], it[1]]);
    }
    if (list.length) out[day] = list.sort((a, b) => a[0].localeCompare(b[0]));
  }
  return out;
}

async function saveStaff(ctx: BizCtx, p: P) {
  const s = p.staff ?? {};
  const name = str(s.name, 60);
  if (name.length < 1) throw new UserError("Введите имя");
  const wh = validateWorkHours(s.work_hours);
  const tgId = s.tg_id ? int(s.tg_id, "tg_id") : null;
  const vals = [name, str(s.description, 200), tgId, wh, s.active !== false, int(s.sort ?? 0, "sort")];
  if (s.id) {
    const rows = await db().query(
      `update staff set name=$3, description=$4, tg_id=$5, work_hours=$6, active=$7, sort=$8
       where id = $1 and business_id = $2 returning *`,
      [int(s.id, "id"), ctx.business.id, ...vals],
    );
    if (!rows.length) throw new UserError("Не найдено");
    return rows[0];
  }
  const [row] = await db().query(
    `insert into staff (business_id, name, description, tg_id, work_hours, active, sort) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [ctx.business.id, ...vals],
  );
  return row;
}

async function deleteStaff(ctx: BizCtx, p: P) {
  const id = int(p.id, "id");
  const active = await db().query(`select id from staff where business_id = $1 and active and id <> $2`, [ctx.business.id, id]);
  if (!active.length) throw new UserError("Нужен хотя бы один активный мастер");
  const has = await db().query(`select 1 from bookings where staff_id = $1 limit 1`, [id]);
  if (has.length) {
    const future = await db().query(`select 1 from bookings where staff_id = $1 and status='confirmed' and starts_at > now() limit 1`, [id]);
    if (future.length) throw new UserError("У мастера есть будущие записи — сначала перенесите или отмените их");
    await db().query(`update staff set active = false where id = $1 and business_id = $2`, [id, ctx.business.id]);
  } else {
    await db().query(`delete from staff where id = $1 and business_id = $2`, [id, ctx.business.id]);
  }
  return { ok: true };
}

async function listTimeOff(ctx: BizCtx) {
  return db().query(
    `select t.*, s.name as staff_name from time_off t left join staff s on s.id = t.staff_id
     where t.business_id = $1 and t.ends_at > now() order by t.starts_at limit 100`,
    [ctx.business.id],
  );
}

async function addTimeOff(ctx: BizCtx, p: P) {
  const tz = ctx.business.timezone;
  const dateFrom = str(p.dateFrom, 10);
  const dateTo = str(p.dateTo, 10) || dateFrom;
  const d1 = DateTime.fromISO(dateFrom, { zone: tz });
  const d2 = DateTime.fromISO(dateTo, { zone: tz });
  if (!d1.isValid || !d2.isValid || d2 < d1) throw new UserError("Проверьте даты");
  let start = d1.startOf("day");
  let end = d2.plus({ days: 1 }).startOf("day");
  if (p.timeFrom && p.timeTo) {
    if (!HM.test(p.timeFrom) || !HM.test(p.timeTo)) throw new UserError("Время в формате ЧЧ:ММ");
    const [h1, m1] = p.timeFrom.split(":").map(Number);
    const [h2, m2] = p.timeTo.split(":").map(Number);
    start = d1.set({ hour: h1, minute: m1 });
    end = d2.set({ hour: h2, minute: m2 });
    if (end <= start) throw new UserError("Конец должен быть позже начала");
  }
  const staffId = p.staffId ? int(p.staffId, "staffId") : null;
  const [row] = await db().query(
    `insert into time_off (business_id, staff_id, starts_at, ends_at, reason) values ($1,$2,$3,$4,$5) returning *`,
    [ctx.business.id, staffId, start.toUTC().toISO(), end.toUTC().toISO(), str(p.reason, 100)],
  );
  const conflicts = await db().query(
    `select count(*)::int as n from bookings where business_id = $1 and status = 'confirmed'
     and starts_at < $3 and ends_at > $2 and ($4::bigint is null or staff_id = $4)`,
    [ctx.business.id, row.starts_at, row.ends_at, staffId],
  );
  return { ...row, conflicts: conflicts[0].n };
}

async function removeTimeOff(ctx: BizCtx, p: P) {
  await db().query(`delete from time_off where id = $1 and business_id = $2`, [int(p.id, "id"), ctx.business.id]);
  return { ok: true };
}

const SETTINGS_KEYS: (keyof BusinessSettings)[] = [
  "emoji", "accent", "description", "address", "contactPhone", "links", "welcome", "afterBookingText", "labels",
  "stepMin", "minLeadMin", "maxDaysAhead", "cancelHours", "chooseStaff", "requirePhone", "remind2h", "fields",
];

async function saveSettings(ctx: BizCtx, p: P) {
  const incoming = (p.settings ?? {}) as Record<string, unknown>;
  const settings: Partial<BusinessSettings> = {};
  for (const k of SETTINGS_KEYS) if (k in incoming) (settings as any)[k] = incoming[k];
  for (const k of ["stepMin", "minLeadMin", "maxDaysAhead", "cancelHours"] as const) {
    if (k in settings) settings[k] = Math.max(0, Math.min(int(settings[k], k), 10_000));
  }
  if (settings.maxDaysAhead !== undefined && settings.maxDaysAhead > 180) settings.maxDaysAhead = 180;
  if (settings.fields) {
    settings.fields = (settings.fields as any[]).slice(0, 6).map((f, i) => ({
      key: str(f.key, 20).replace(/[^a-z0-9_]/gi, "") || `f${i}`,
      label: str(f.label, 60),
      placeholder: str(f.placeholder, 80),
      required: Boolean(f.required),
    })).filter((f) => f.label);
  }
  if (settings.links) {
    settings.links = (settings.links as any[]).slice(0, 6)
      .map((l) => ({ title: str(l.title, 30), url: str(l.url, 200) }))
      .filter((l) => l.title && /^https?:\/\//.test(l.url));
  }
  for (const k of ["description", "welcome", "afterBookingText"] as const) {
    if (k in settings) settings[k] = str(settings[k], 1000);
  }
  if (settings.accent && !/^#[0-9a-f]{6}$/i.test(settings.accent)) delete settings.accent;
  const b = await store.updateBusiness(db(), ctx.business.id, {
    name: p.name ? str(p.name, 80) : undefined,
    timezone: p.timezone ? str(p.timezone, 60) : undefined,
    settings,
  });
  return publicBusiness(b);
}

async function portfolioAdd(ctx: BizCtx, p: P) {
  const b64 = String(p.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1000) throw new UserError("Не удалось прочитать фото");
  if (buf.length > 3_500_000) throw new UserError("Фото слишком большое");
  const count = await db().query(`select count(*)::int as n from portfolio where business_id = $1`, [ctx.business.id]);
  if (count[0].n >= 60) throw new UserError("В портфолио максимум 60 фото");
  const { file_id } = await tg().sendPhoto(
    ctx.init.user.id,
    new Uint8Array(buf),
    `🖼 Добавлено в портфолио «${ctx.business.name}»`,
  );
  const [row] = await db().query(
    `insert into portfolio (business_id, file_id, caption, sort) values ($1, $2, $3, $4) returning id, caption`,
    [ctx.business.id, file_id, str(p.caption, 200), 0],
  );
  return row;
}

async function portfolioRemove(ctx: BizCtx, p: P) {
  await db().query(`delete from portfolio where id = $1 and business_id = $2`, [int(p.id, "id"), ctx.business.id]);
  return { ok: true };
}

/** Баннер главной: фото хранится в Telegram, как портфолио. */
async function bannerSet(ctx: BizCtx, p: P) {
  const b64 = String(p.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1000) throw new UserError("Не удалось прочитать фото");
  if (buf.length > 3_500_000) throw new UserError("Фото слишком большое");
  const { file_id } = await tg().sendPhoto(ctx.init.user.id, new Uint8Array(buf), `🖼 Новый баннер «${ctx.business.name}»`);
  const b = await store.updateBusiness(db(), ctx.business.id, { settings: { bannerFileId: file_id } });
  return publicBusiness(b);
}

async function bannerRemove(ctx: BizCtx) {
  const b = await store.updateBusiness(db(), ctx.business.id, { settings: { bannerFileId: "" } });
  return publicBusiness(b);
}

async function adminClients(ctx: BizCtx) {
  return db().query(
    `select c.tg_id, c.name, c.phone, c.last_seen, c.blocked_bot,
       (select count(*) from bookings b where b.business_id = c.business_id and b.client_tg_id = c.tg_id and b.status in ('confirmed','done'))::int as visits
     from clients c where c.business_id = $1 order by c.last_seen desc limit 500`,
    [ctx.business.id],
  );
}

async function adminInvite(ctx: BizCtx, p: P) {
  const role = p.role === "owner" ? "owner" : "admin";
  if (role === "owner" && ctx.role !== "super" && ctx.role !== "owner") throw new UserError("Нет прав");
  const code = await store.createInvite(db(), ctx.business.id, role, ctx.init.user.id);
  return { link: inviteLink(code), role };
}

async function adminRemove(ctx: BizCtx, p: P) {
  const tgId = int(p.tgId, "tgId");
  const [target] = await db().query(`select role from business_admins where business_id = $1 and tg_id = $2`, [ctx.business.id, tgId]);
  if (!target) return { ok: true };
  if (target.role === "owner") {
    const owners = await db().query(`select count(*)::int as n from business_admins where business_id = $1 and role='owner'`, [ctx.business.id]);
    if (owners[0].n <= 1 && ctx.role !== "super") throw new UserError("Нельзя удалить единственного владельца");
  }
  await db().query(`delete from business_admins where business_id = $1 and tg_id = $2`, [ctx.business.id, tgId]);
  return { ok: true };
}

async function adminBroadcast(ctx: BizCtx, p: P) {
  const text = str(p.text, 3000);
  if (text.length < 3) throw new UserError("Напишите текст рассылки");
  // не чаще раза в 6 часов, чтобы клиенты не блокировали бота
  const [last] = await db().query(`select settings->>'lastBroadcastAt' as at from businesses where id = $1`, [ctx.business.id]);
  if (last?.at && Date.now() - Date.parse(last.at) < 6 * 3600_000 && ctx.role !== "super") {
    throw new UserError("Рассылку можно делать не чаще раза в 6 часов");
  }
  await db().query(`update businesses set settings = settings || jsonb_build_object('lastBroadcastAt', now()::text) where id = $1`, [
    ctx.business.id,
  ]);
  return notify.broadcast(db(), ctx.business, text);
}

// ---------------- суперадмин ----------------

async function superList() {
  const [businesses, stats] = await Promise.all([store.allBusinesses(db()), store.platformStats(db())]);
  return { businesses: businesses.map((b: any) => ({ ...b, links: { client: clientLink(b.slug), admin: adminLink(b.slug) } })), stats };
}

async function superCreate(ctx: Ctx, p: P) {
  const b = await store.createBusinessFromTemplate(db(), {
    templateId: str(p.templateId, 30),
    name: str(p.name, 80),
    slug: p.slug ? str(p.slug, 40) : undefined,
    createdBy: ctx.init.user.id,
    timezone: p.timezone ? str(p.timezone, 60) : undefined,
  });
  const code = await store.createInvite(db(), b.id, "owner", ctx.init.user.id);
  return { business: publicBusiness(b), links: links(b), ownerInvite: inviteLink(code) };
}

async function superSetStatus(_ctx: Ctx, p: P) {
  const status = p.status === "blocked" ? "blocked" : "active";
  await db().query(`update businesses set status = $2 where id = $1`, [int(p.businessId, "businessId"), status]);
  return { ok: true };
}

async function superDelete(_ctx: Ctx, p: P) {
  const id = int(p.businessId, "businessId");
  const b = await requireBusiness(id);
  if (str(p.confirm, 60) !== b.slug) throw new UserError("Для удаления введите ссылку-идентификатор бизнеса");
  await db().query(`delete from businesses where id = $1`, [id]);
  return { ok: true };
}

// ---------------- диспетчер ----------------

type Need = "user" | "admin" | "owner" | "super";
const methods: Record<string, { need: Need; fn: (ctx: any, p: P) => Promise<unknown> }> = {
  boot: { need: "user", fn: boot },
  availability: { need: "user", fn: availability },
  book: { need: "user", fn: book },
  myBookings: { need: "user", fn: myBookings },
  cancelMy: { need: "user", fn: cancelMy },

  "admin.overview": { need: "admin", fn: adminOverview },
  "admin.bookings": { need: "admin", fn: adminBookings },
  "admin.cancelBooking": { need: "admin", fn: adminCancelBooking },
  "admin.setStatus": { need: "admin", fn: adminSetStatus },
  "admin.saveService": { need: "admin", fn: saveService },
  "admin.deleteService": { need: "admin", fn: deleteService },
  "admin.saveStaff": { need: "admin", fn: saveStaff },
  "admin.deleteStaff": { need: "admin", fn: deleteStaff },
  "admin.timeOff": { need: "admin", fn: listTimeOff },
  "admin.addTimeOff": { need: "admin", fn: addTimeOff },
  "admin.removeTimeOff": { need: "admin", fn: removeTimeOff },
  "admin.saveSettings": { need: "admin", fn: saveSettings },
  "admin.portfolio": { need: "admin", fn: (ctx: BizCtx) => store.listPortfolio(db(), ctx.business.id).then((l) => l.map(({ id, caption }) => ({ id, caption }))) },
  "admin.portfolioAdd": { need: "admin", fn: portfolioAdd },
  "admin.bannerSet": { need: "admin", fn: bannerSet },
  "admin.bannerRemove": { need: "admin", fn: bannerRemove },
  "admin.portfolioRemove": { need: "admin", fn: portfolioRemove },
  "admin.clients": { need: "admin", fn: adminClients },
  "admin.invite": { need: "admin", fn: adminInvite },
  "admin.removeAdmin": { need: "owner", fn: adminRemove },
  "admin.broadcast": { need: "owner", fn: adminBroadcast },

  "super.list": { need: "super", fn: superList },
  "super.create": { need: "super", fn: superCreate },
  "super.setStatus": { need: "super", fn: superSetStatus },
  "super.delete": { need: "super", fn: superDelete },
};

export async function dispatch(method: string, params: P, ctx: Ctx): Promise<unknown> {
  const m = methods[method];
  if (!m) throw new UserError("Неизвестный метод");
  const uid = ctx.init.user.id;
  const isSuper = config.superadmins.includes(uid);

  if (m.need === "user") return m.fn(ctx, params);
  if (m.need === "super") {
    if (!isSuper) throw new UserError("Нет доступа");
    return m.fn(ctx, params);
  }
  const business = await requireBusiness(params.businessId);
  const role = await store.roleFor(db(), uid, business.id, config.superadmins);
  if (!role) throw new UserError("Нет доступа к этому бизнесу");
  if (m.need === "owner" && role === "admin") throw new UserError("Доступно только владельцу");
  return m.fn({ ...ctx, business, role } satisfies BizCtx, params);
}
