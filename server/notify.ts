import type { Db } from "./db.js";
import { config, webAppUrl } from "./config.js";
import { esc, fmtWhen, relDay, fmtTime, rub } from "./format.js";
import type { Booking, Business } from "./store.js";
import { isBlockedError, tg } from "./telegram.js";

const webAppButton = (text: string, url: string) => ({ reply_markup: { inline_keyboard: [[{ text, web_app: { url } }]] } });

async function safeSend(chatId: number, html: string, extra?: Record<string, unknown>): Promise<boolean> {
  try {
    await tg().sendMessage(chatId, html, extra);
    return true;
  } catch (e) {
    if (!isBlockedError(e)) console.error("sendMessage", chatId, e);
    return false;
  }
}

async function adminRecipients(db: Db, businessId: number, staffId?: number): Promise<number[]> {
  const rows = await db.query<{ tg_id: number }>(
    `select tg_id from business_admins where business_id = $1
     union select tg_id from staff where id = $2 and tg_id is not null`,
    [businessId, staffId ?? 0],
  );
  return rows.map((r) => Number(r.tg_id));
}

/** Строка «Подпись: значение» — подпись курсивом, без эмодзи. */
const row = (label: string, value: string) => `<i>${esc(label)}:</i> ${value}`;

/** Телефон моноширинным — в Telegram он копируется по нажатию. */
const phoneHtml = (p: string) => `<code>${esc(p)}</code>`;

/** Карточка записи в цитате: дата и время жирным, ниже услуга, цена, мастер, ответы на вопросы. */
function bookingCard(b: Booking, biz: Business, staffName?: string): string {
  const lines = [
    `<b>${esc(fmtWhen(b.starts_at, biz.timezone))}</b>`,
    `${esc(b.service_title)}${b.price ? ` — ${rub(b.price)}` : ""}`,
    staffName && biz.settings.chooseStaff ? row(biz.settings.labels.staff, esc(staffName)) : "",
    ...biz.settings.fields.filter((f) => b.answers?.[f.key]).map((f) => row(f.label, esc(b.answers[f.key]))),
  ].filter(Boolean);
  return `<blockquote>${lines.join("\n")}</blockquote>`;
}

const staffName = async (db: Db, id: number) =>
  (await db.query<{ name: string }>(`select name from staff where id = $1`, [id]))[0]?.name;

/** Пустая строка-отступ между блоками сообщения. */
const GAP = "\u0000";
const join = (parts: (string | false | null | undefined)[]) =>
  parts
    .filter((x): x is string => typeof x === "string" && x !== "")
    .map((x) => (x === GAP ? "" : x))
    .join("\n");

export async function onBookingCreated(db: Db, biz: Business, b: Booking) {
  const sName = await staffName(db, b.staff_id);
  const adminText = join([
    `<b>Новая запись</b> · ${esc(biz.name)}`,
    bookingCard(b, biz, sName),
    row("Клиент", `<b>${esc(b.client_name)}</b>`),
    b.client_phone && row("Телефон", phoneHtml(b.client_phone)),
    b.comment && row("Комментарий", esc(b.comment)),
    GAP,
    `<a href="tg://user?id=${b.client_tg_id}">Написать клиенту в Telegram</a>`,
  ]);
  const adminKb = webAppButton("Открыть записи", webAppUrl({ b: biz.slug, view: "admin" }));
  await Promise.all((await adminRecipients(db, biz.id, b.staff_id)).map((id) => safeSend(id, adminText, adminKb)));

  const clientText = join([
    `<b>Вы записаны</b> · ${esc(biz.name)}`,
    bookingCard(b, biz, sName),
    biz.settings.address && row("Адрес", esc(biz.settings.address)),
    biz.settings.contactPhone && row("Телефон", phoneHtml(biz.settings.contactPhone)),
    biz.settings.afterBookingText && GAP,
    biz.settings.afterBookingText && `<i>${esc(biz.settings.afterBookingText)}</i>`,
  ]);
  await safeSend(b.client_tg_id, clientText, webAppButton("Мои записи", webAppUrl({ b: biz.slug, view: "my" })));
}

export async function onBookingCancelled(db: Db, biz: Business, b: Booking) {
  const sName = await staffName(db, b.staff_id);
  if (b.cancelled_by === "client") {
    const text = join([
      `<b>Клиент отменил запись</b> · ${esc(biz.name)}`,
      `<blockquote><s>${esc(fmtWhen(b.starts_at, biz.timezone))}</s>\n${esc(b.service_title)}</blockquote>`,
      row("Клиент", `<b>${esc(b.client_name)}</b>`),
      b.client_phone && row("Телефон", phoneHtml(b.client_phone)),
      GAP,
      "<i>Это время снова свободно для записи.</i>",
    ]);
    await Promise.all((await adminRecipients(db, biz.id, b.staff_id)).map((id) => safeSend(id, text)));
  } else {
    const text = join([
      `<b>Запись отменена</b> · ${esc(biz.name)}`,
      `<blockquote><s>${esc(fmtWhen(b.starts_at, biz.timezone))}</s>\n${esc(b.service_title)}</blockquote>`,
      "Извините за неудобство. Выберите, пожалуйста, другое время — будем рады вас видеть.",
    ]);
    await safeSend(b.client_tg_id, text, webAppButton("Записаться снова", webAppUrl({ b: biz.slug })));
  }
}

export async function sendReminder(biz: Business, b: Booking, kind: "24h" | "2h", now = new Date()) {
  const when = `${relDay(b.starts_at, biz.timezone, now)} в ${fmtTime(b.starts_at, biz.timezone)}`;
  const text = join([
    kind === "2h" ? `<b>Скоро визит — ${esc(when)}</b>` : `<b>Напоминаем о записи — ${esc(when)}</b>`,
    `<blockquote>${esc(biz.name)}\n${esc(b.service_title)}</blockquote>`,
    biz.settings.address && row("Адрес", esc(biz.settings.address)),
    GAP,
    kind === "24h" ? "<i>Если планы изменились — отмените запись, чтобы время досталось другому.</i>" : "До встречи!",
  ]);
  return safeSend(b.client_tg_id, text, webAppButton("Мои записи", webAppUrl({ b: biz.slug, view: "my" })));
}

export async function notifySuperadmins(html: string) {
  await Promise.all(config.superadmins.map((id) => safeSend(id, html)));
}

/** Рассылка клиентам бизнеса. ~25 сообщений/с — в пределах лимитов Telegram. */
export async function broadcast(db: Db, biz: Business, text: string): Promise<{ sent: number; failed: number }> {
  const clients = await db.query<{ tg_id: number }>(
    `select tg_id from clients where business_id = $1 and not blocked_bot order by last_seen desc limit 2000`,
    [biz.id],
  );
  const html = `<b>${esc(biz.name)}</b>\n\n${esc(text)}`;
  const kb = webAppButton("Записаться", webAppUrl({ b: biz.slug }));
  let sent = 0;
  let failed = 0;
  const blocked: number[] = [];
  for (let i = 0; i < clients.length; i += 25) {
    const batch = clients.slice(i, i + 25);
    const res = await Promise.all(batch.map((c) => safeSend(Number(c.tg_id), html, kb)));
    res.forEach((ok, j) => {
      if (ok) sent++;
      else {
        failed++;
        blocked.push(Number(batch[j].tg_id));
      }
    });
    if (i + 25 < clients.length) await new Promise((r) => setTimeout(r, 1100));
  }
  if (blocked.length) {
    await db.query(`update clients set blocked_bot = true where business_id = $1 and tg_id = any($2::bigint[])`, [
      biz.id,
      blocked,
    ]);
  }
  return { sent, failed };
}
