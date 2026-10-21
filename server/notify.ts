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

function bookingLines(b: Booking, biz: Business, staffName?: string): string {
  const fieldLines = biz.settings.fields
    .filter((f) => b.answers?.[f.key])
    .map((f) => `${esc(f.label)}: ${esc(b.answers[f.key])}`);
  return [
    `🗓 <b>${esc(fmtWhen(b.starts_at, biz.timezone))}</b>`,
    `💼 ${esc(b.service_title)}${b.price ? ` · ${rub(b.price)}` : ""}`,
    staffName && biz.settings.chooseStaff ? `👤 ${esc(biz.settings.labels.staff)}: ${esc(staffName)}` : "",
    ...fieldLines,
  ]
    .filter(Boolean)
    .join("\n");
}

const staffName = async (db: Db, id: number) =>
  (await db.query<{ name: string }>(`select name from staff where id = $1`, [id]))[0]?.name;

export async function onBookingCreated(db: Db, biz: Business, b: Booking) {
  const sName = await staffName(db, b.staff_id);
  const adminText = [
    `🆕 <b>Новая запись</b> · ${esc(biz.name)}`,
    "",
    bookingLines(b, biz, sName),
    `🙋 ${esc(b.client_name)}${b.client_phone ? ` · ${esc(b.client_phone)}` : ""}`,
    `<a href="tg://user?id=${b.client_tg_id}">Написать клиенту</a>`,
    b.comment ? `💬 ${esc(b.comment)}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
  const adminKb = webAppButton("Открыть записи", webAppUrl({ b: biz.slug, view: "admin" }));
  await Promise.all((await adminRecipients(db, biz.id, b.staff_id)).map((id) => safeSend(id, adminText, adminKb)));

  const clientText = [
    `✅ <b>Вы записаны!</b> ${esc(biz.settings.emoji)} ${esc(biz.name)}`,
    "",
    bookingLines(b, biz, sName),
    biz.settings.address ? `📍 ${esc(biz.settings.address)}` : "",
    biz.settings.afterBookingText ? `\n${esc(biz.settings.afterBookingText)}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
  await safeSend(b.client_tg_id, clientText, webAppButton("Мои записи", webAppUrl({ b: biz.slug, view: "my" })));
}

export async function onBookingCancelled(db: Db, biz: Business, b: Booking) {
  const sName = await staffName(db, b.staff_id);
  if (b.cancelled_by === "client") {
    const text = `🚫 <b>Клиент отменил запись</b> · ${esc(biz.name)}\n\n${bookingLines(b, biz, sName)}\n🙋 ${esc(b.client_name)}`;
    await Promise.all((await adminRecipients(db, biz.id, b.staff_id)).map((id) => safeSend(id, text)));
  } else {
    const text = [
      `😔 <b>Запись отменена</b> · ${esc(biz.name)}`,
      "",
      bookingLines(b, biz, sName),
      "",
      "Выберите, пожалуйста, другое время — будем рады вас видеть.",
    ].join("\n");
    await safeSend(b.client_tg_id, text, webAppButton("Записаться снова", webAppUrl({ b: biz.slug })));
  }
}

export async function sendReminder(biz: Business, b: Booking, kind: "24h" | "2h", now = new Date()) {
  const when = `${relDay(b.starts_at, biz.timezone, now)} в ${fmtTime(b.starts_at, biz.timezone)}`;
  const head = [
    kind === "2h" ? `⏰ <b>Скоро визит: ${esc(when)}</b>` : `🔔 <b>Напоминаем о записи: ${esc(when)}</b>`,
    `${esc(biz.settings.emoji)} ${esc(biz.name)} · ${esc(b.service_title)}`,
  ];
  if (biz.settings.address) head.push(`📍 ${esc(biz.settings.address)}`);
  const tail = kind === "24h" ? "Если планы изменились — отмените запись, чтобы время досталось другому." : "До встречи!";
  const text = `${head.join("\n")}\n\n${tail}`;
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
  const html = `${esc(biz.settings.emoji)} <b>${esc(biz.name)}</b>\n\n${esc(text)}`;
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
