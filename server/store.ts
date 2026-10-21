import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { type Db, isOverlapError } from "./db.js";
import { computeSlots, dayBoundsUtc, upcomingDates, type Slot, type WorkHours } from "./slots.js";
import { type BusinessSettings, getTemplate, withDefaults } from "./templates.js";
import type { TgUser } from "./auth.js";

export class UserError extends Error {}

export interface Business {
  id: number;
  slug: string;
  name: string;
  template: string;
  status: "active" | "blocked";
  timezone: string;
  settings: BusinessSettings;
  created_at: Date;
}

export interface Staff {
  id: number;
  business_id: number;
  name: string;
  description: string;
  tg_id: number | null;
  work_hours: WorkHours;
  active: boolean;
  sort: number;
}

export interface Service {
  id: number;
  business_id: number;
  title: string;
  description: string;
  price: number;
  price_from: boolean;
  duration_min: number;
  active: boolean;
  sort: number;
}

export interface Booking {
  id: number;
  business_id: number;
  staff_id: number;
  service_id: number | null;
  service_title: string;
  price: number;
  client_tg_id: number;
  client_name: string;
  client_phone: string;
  answers: Record<string, string>;
  comment: string;
  starts_at: Date;
  ends_at: Date;
  status: "confirmed" | "cancelled" | "done" | "no_show";
  cancelled_by: "client" | "admin" | null;
  reminded_24h: boolean;
  reminded_2h: boolean;
  created_at: Date;
}

export type Role = "super" | "owner" | "admin" | null;

const rowToBusiness = (r: any): Business => ({ ...r, settings: withDefaults(r.template, r.settings) });

// ---------- пользователи ----------

export async function upsertUser(db: Db, u: TgUser): Promise<{ last_business_id: number | null }> {
  const [row] = await db.query(
    `insert into users (tg_id, first_name, username) values ($1, $2, $3)
     on conflict (tg_id) do update set first_name = excluded.first_name, username = excluded.username, seen_at = now()
     returning last_business_id`,
    [u.id, u.first_name ?? "", u.username ?? null],
  );
  return row;
}

export async function setLastBusiness(db: Db, tgId: number, businessId: number) {
  await db.query(`update users set last_business_id = $2 where tg_id = $1`, [tgId, businessId]);
}

export async function touchClient(db: Db, businessId: number, u: TgUser) {
  await db.query(
    `insert into clients (business_id, tg_id, name) values ($1, $2, $3)
     on conflict (business_id, tg_id) do update set last_seen = now(), blocked_bot = false`,
    [businessId, u.id, [u.first_name, u.last_name].filter(Boolean).join(" ")],
  );
}

// ---------- бизнесы ----------

export function slugify(name: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const base = name
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base.length >= 3 ? base : `biz-${base || "new"}`;
}

export async function createBusinessFromTemplate(
  db: Db,
  opts: { templateId: string; name: string; slug?: string; ownerTgId?: number; createdBy?: number; timezone?: string },
): Promise<Business> {
  const tpl = getTemplate(opts.templateId);
  if (!tpl) throw new UserError("Неизвестный шаблон");
  const name = opts.name.trim().slice(0, 80);
  if (name.length < 2) throw new UserError("Слишком короткое название");

  return db.tx(async (tx) => {
    let slug = opts.slug ? slugify(opts.slug) : slugify(name);
    const taken = await tx.query(`select 1 from businesses where slug = $1`, [slug]);
    if (taken.length) {
      if (opts.slug) throw new UserError("Такая ссылка уже занята");
      slug = `${slug.slice(0, 28)}-${randomBytes(2).toString("hex")}`;
    }
    const [b] = await tx.query(
      `insert into businesses (slug, name, template, timezone, settings, created_by)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [slug, name, tpl.id, opts.timezone ?? "Europe/Moscow", tpl.settings, opts.createdBy ?? null],
    );
    for (const [i, s] of tpl.staff.entries()) {
      await tx.query(
        `insert into staff (business_id, name, description, work_hours, sort) values ($1, $2, $3, $4, $5)`,
        [b.id, s.name, s.description ?? "", s.work_hours, i],
      );
    }
    for (const [i, s] of tpl.services.entries()) {
      await tx.query(
        `insert into services (business_id, title, description, price, price_from, duration_min, sort)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [b.id, s.title, s.description ?? "", s.price, s.price_from ?? false, s.duration_min, i],
      );
    }
    if (opts.ownerTgId) {
      await tx.query(`insert into business_admins (business_id, tg_id, role) values ($1, $2, 'owner')`, [b.id, opts.ownerTgId]);
    }
    return rowToBusiness(b);
  });
}

export async function getBusiness(db: Db, idOrSlug: number | string): Promise<Business | null> {
  const rows =
    typeof idOrSlug === "number"
      ? await db.query(`select * from businesses where id = $1`, [idOrSlug])
      : await db.query(`select * from businesses where slug = $1`, [idOrSlug.toLowerCase()]);
  return rows[0] ? rowToBusiness(rows[0]) : null;
}

export async function roleFor(db: Db, tgId: number, businessId: number, superadmins: number[]): Promise<Role> {
  if (superadmins.includes(tgId)) return "super";
  const [r] = await db.query(`select role from business_admins where business_id = $1 and tg_id = $2`, [businessId, tgId]);
  return (r?.role as Role) ?? null;
}

export async function businessesOfAdmin(db: Db, tgId: number): Promise<(Business & { role: string })[]> {
  const rows = await db.query(
    `select b.*, a.role from business_admins a join businesses b on b.id = a.business_id
     where a.tg_id = $1 order by b.created_at`,
    [tgId],
  );
  return rows.map((r) => ({ ...rowToBusiness(r), role: r.role }));
}

export async function updateBusiness(
  db: Db,
  businessId: number,
  patch: { name?: string; timezone?: string; settings?: Partial<BusinessSettings> },
): Promise<Business> {
  const b = await getBusiness(db, businessId);
  if (!b) throw new UserError("Бизнес не найден");
  if (patch.timezone && !DateTime.local().setZone(patch.timezone).isValid) throw new UserError("Неизвестный часовой пояс");
  const settings = { ...b.settings, ...(patch.settings ?? {}) };
  if (settings.stepMin < 5 || settings.stepMin > 240) throw new UserError("Шаг сетки — от 5 до 240 минут");
  const [row] = await db.query(
    `update businesses set name = $2, timezone = $3, settings = $4 where id = $1 returning *`,
    [businessId, (patch.name ?? b.name).trim().slice(0, 80), patch.timezone ?? b.timezone, settings],
  );
  return rowToBusiness(row);
}

// ---------- приглашения ----------

export async function createInvite(db: Db, businessId: number, role: "owner" | "admin", createdBy: number): Promise<string> {
  const code = randomBytes(9).toString("base64url");
  await db.query(`insert into invites (code, business_id, role, created_by) values ($1, $2, $3, $4)`, [
    code,
    businessId,
    role,
    createdBy,
  ]);
  return code;
}

export async function claimInvite(db: Db, code: string, tgId: number): Promise<{ business: Business; role: string }> {
  return db.tx(async (tx) => {
    const [inv] = await tx.query(`select * from invites where code = $1 for update`, [code]);
    if (!inv) throw new UserError("Приглашение не найдено");
    if (inv.used_by && inv.used_by !== tgId) throw new UserError("Приглашение уже использовано");
    if (new Date(inv.expires_at) < new Date()) throw new UserError("Срок приглашения истёк");
    await tx.query(`update invites set used_by = $2, used_at = now() where code = $1`, [code, tgId]);
    await tx.query(
      `insert into business_admins (business_id, tg_id, role) values ($1, $2, $3)
       on conflict (business_id, tg_id) do update set role = case when business_admins.role = 'owner' then 'owner' else excluded.role end`,
      [inv.business_id, tgId, inv.role],
    );
    const [b] = await tx.query(`select * from businesses where id = $1`, [inv.business_id]);
    return { business: rowToBusiness(b), role: inv.role };
  });
}

// ---------- каталог ----------

export const listServices = (db: Db, businessId: number, all = false) =>
  db.query<Service>(
    `select * from services where business_id = $1 ${all ? "" : "and active"} order by sort, id`,
    [businessId],
  );

export const listStaff = (db: Db, businessId: number, all = false) =>
  db.query<Staff>(`select * from staff where business_id = $1 ${all ? "" : "and active"} order by sort, id`, [businessId]);

export const listPortfolio = (db: Db, businessId: number) =>
  db.query<{ id: number; file_id: string; caption: string }>(
    `select id, file_id, caption from portfolio where business_id = $1 order by sort, id desc limit 60`,
    [businessId],
  );

// ---------- доступность ----------

export interface AvailableSlot extends Slot {
  staffIds: number[];
}

async function busyFor(db: Db, businessId: number, staffIds: number[], from: string, to: string) {
  const bookings = await db.query<{ staff_id: number; starts_at: Date; ends_at: Date }>(
    `select staff_id, starts_at, ends_at from bookings
     where business_id = $1 and status = 'confirmed' and starts_at < $3 and ends_at > $2`,
    [businessId, from, to],
  );
  const off = await db.query<{ staff_id: number | null; starts_at: Date; ends_at: Date }>(
    `select staff_id, starts_at, ends_at from time_off where business_id = $1 and starts_at < $3 and ends_at > $2`,
    [businessId, from, to],
  );
  const map = new Map<number, { start: Date; end: Date }[]>(staffIds.map((id) => [id, []]));
  for (const b of bookings) map.get(b.staff_id)?.push({ start: b.starts_at, end: b.ends_at });
  for (const o of off) {
    for (const id of staffIds) {
      if (o.staff_id === null || o.staff_id === id) map.get(id)!.push({ start: o.starts_at, end: o.ends_at });
    }
  }
  return map;
}

export async function availability(
  db: Db,
  opts: { business: Business; serviceId: number; staffId?: number | null; days: number; now?: Date },
): Promise<Record<string, AvailableSlot[]>> {
  const { business } = opts;
  const now = opts.now ?? new Date();
  const [service] = await db.query<Service>(`select * from services where id = $1 and business_id = $2 and active`, [
    opts.serviceId,
    business.id,
  ]);
  if (!service) throw new UserError("Услуга не найдена");
  let staff = await listStaff(db, business.id);
  if (opts.staffId) staff = staff.filter((s) => s.id === opts.staffId);
  if (!staff.length) return {};

  const s = business.settings;
  const days = Math.min(opts.days, s.maxDaysAhead + 1);
  const dates = upcomingDates(now, business.timezone, days);
  const from = dayBoundsUtc(dates[0], business.timezone).from;
  const to = dayBoundsUtc(dates[dates.length - 1], business.timezone).to;
  const busy = await busyFor(db, business.id, staff.map((x) => x.id), from, to);

  const result: Record<string, AvailableSlot[]> = {};
  for (const date of dates) {
    const byStart = new Map<string, AvailableSlot>();
    for (const st of staff) {
      const slots = computeSlots({
        date,
        tz: business.timezone,
        workHours: st.work_hours,
        stepMin: s.stepMin,
        durationMin: service.duration_min,
        busy: busy.get(st.id) ?? [],
        now,
        minLeadMin: s.minLeadMin,
        maxDaysAhead: s.maxDaysAhead,
      });
      for (const slot of slots) {
        const ex = byStart.get(slot.start);
        if (ex) ex.staffIds.push(st.id);
        else byStart.set(slot.start, { ...slot, staffIds: [st.id] });
      }
    }
    const list = [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
    if (list.length) result[date] = list;
  }
  return result;
}

// ---------- записи ----------

export class BookingConflict extends UserError {
  constructor() {
    super("Это время только что заняли. Выберите другое, пожалуйста.");
  }
}

export async function createBooking(
  db: Db,
  opts: {
    business: Business;
    serviceId: number;
    staffId?: number | null;
    start: string;
    client: { tgId: number; name: string; phone: string };
    answers?: Record<string, string>;
    comment?: string;
    now?: Date;
  },
): Promise<Booking> {
  const { business, client } = opts;
  if (business.status !== "active") throw new UserError("Запись временно недоступна");
  const s = business.settings;
  const name = client.name.trim().slice(0, 80);
  if (name.length < 2) throw new UserError("Укажите имя");
  const phone = client.phone.trim();
  if (s.requirePhone && !phone) throw new UserError("Укажите телефон");
  const answers: Record<string, string> = {};
  for (const f of s.fields) {
    const v = (opts.answers?.[f.key] ?? "").trim().slice(0, 300);
    if (f.required && !v) throw new UserError(`Заполните поле «${f.label}»`);
    if (v) answers[f.key] = v;
  }

  const date = DateTime.fromISO(opts.start).setZone(business.timezone).toISODate()!;
  const avail = await availability(db, {
    business,
    serviceId: opts.serviceId,
    staffId: opts.staffId,
    days: s.maxDaysAhead + 1,
    now: opts.now,
  });
  const startIso = new Date(opts.start).toISOString();
  const slot = (avail[date] ?? []).find((x) => x.start === startIso);
  if (!slot) throw new BookingConflict();

  const [service] = await listServices(db, business.id).then((l) => l.filter((x) => x.id === opts.serviceId));
  // «любой мастер»: пробуем по очереди — ограничение в БД не даст записать двоих на одно время
  for (const staffId of slot.staffIds) {
    try {
      const [row] = await db.query<Booking>(
        `insert into bookings (business_id, staff_id, service_id, service_title, price, client_tg_id, client_name,
           client_phone, answers, comment, starts_at, ends_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [
          business.id,
          staffId,
          service.id,
          service.title,
          service.price,
          client.tgId,
          name,
          phone,
          answers,
          (opts.comment ?? "").trim().slice(0, 500),
          slot.start,
          slot.end,
        ],
      );
      await db.query(
        `insert into clients (business_id, tg_id, name, phone) values ($1, $2, $3, $4)
         on conflict (business_id, tg_id) do update set name = excluded.name, phone = excluded.phone, last_seen = now()`,
        [business.id, client.tgId, name, phone],
      );
      return row;
    } catch (e) {
      if (isOverlapError(e)) continue;
      throw e;
    }
  }
  throw new BookingConflict();
}

export async function getBookingById(db: Db, id: number): Promise<Booking | null> {
  const [r] = await db.query<Booking>(`select * from bookings where id = $1`, [id]);
  return r ?? null;
}

export async function cancelBooking(
  db: Db,
  opts: { bookingId: number; business: Business; by: "client" | "admin"; tgId: number; now?: Date },
): Promise<Booking> {
  const b = await getBookingById(db, opts.bookingId);
  if (!b || b.business_id !== opts.business.id) throw new UserError("Запись не найдена");
  if (b.status !== "confirmed") throw new UserError("Запись уже неактивна");
  if (opts.by === "client") {
    if (b.client_tg_id !== opts.tgId) throw new UserError("Это не ваша запись");
    const hoursLeft = (new Date(b.starts_at).getTime() - (opts.now ?? new Date()).getTime()) / 3_600_000;
    if (hoursLeft < opts.business.settings.cancelHours) {
      throw new UserError(`Отменить онлайн можно не позже чем за ${opts.business.settings.cancelHours} ч. Напишите мастеру.`);
    }
  }
  const [row] = await db.query<Booking>(
    `update bookings set status = 'cancelled', cancelled_by = $2 where id = $1 returning *`,
    [b.id, opts.by],
  );
  return row;
}

export const clientBookings = (db: Db, businessId: number, tgId: number) =>
  db.query<Booking>(
    `select * from bookings where business_id = $1 and client_tg_id = $2
     and (starts_at > now() - interval '30 days') order by starts_at desc limit 30`,
    [businessId, tgId],
  );

export const bookingsInRange = (db: Db, businessId: number, from: string, to: string) =>
  db.query<Booking & { staff_name: string }>(
    `select b.*, s.name as staff_name from bookings b join staff s on s.id = b.staff_id
     where b.business_id = $1 and b.starts_at >= $2 and b.starts_at < $3 order by b.starts_at`,
    [businessId, from, to],
  );

export async function setBookingStatus(db: Db, businessId: number, id: number, status: "done" | "no_show" | "confirmed") {
  const [row] = await db.query<Booking>(
    `update bookings set status = $3 where id = $1 and business_id = $2 and status <> 'cancelled' returning *`,
    [id, businessId, status],
  );
  if (!row) throw new UserError("Запись не найдена");
  return row;
}

// ---------- статистика ----------

export async function businessStats(db: Db, businessId: number) {
  const [r] = await db.query(
    `select
       (select count(*) from clients where business_id = $1)::int as clients,
       (select count(*) from bookings where business_id = $1 and status in ('confirmed','done'))::int as bookings,
       (select count(*) from bookings where business_id = $1 and status = 'confirmed' and starts_at > now())::int as upcoming,
       (select count(*) from bookings where business_id = $1 and status = 'cancelled')::int as cancelled,
       (select coalesce(sum(price),0) from bookings where business_id = $1 and status = 'done'
          and starts_at > now() - interval '30 days')::int as revenue_30d`,
    [businessId],
  );
  return r as { clients: number; bookings: number; upcoming: number; cancelled: number; revenue_30d: number };
}

export async function allBusinesses(db: Db) {
  return db.query(
    `select b.id, b.slug, b.name, b.template, b.status, b.created_at,
       (select count(*) from clients c where c.business_id = b.id)::int as clients,
       (select count(*) from bookings k where k.business_id = b.id and k.status in ('confirmed','done'))::int as bookings,
       (select count(*) from business_admins a where a.business_id = b.id and a.role = 'owner')::int as owners
     from businesses b order by b.created_at desc`,
  );
}

export async function platformStats(db: Db) {
  const [r] = await db.query(
    `select (select count(*) from businesses)::int as businesses,
            (select count(*) from users)::int as users,
            (select count(*) from bookings)::int as bookings,
            (select count(*) from users where seen_at > now() - interval '30 days')::int as active_30d`,
  );
  return r;
}
