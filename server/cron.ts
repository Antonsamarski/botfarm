import { DateTime } from "luxon";
import { db } from "./db.js";
import { sendReminder } from "./notify.js";
import { getBusiness, type Booking, type Business } from "./store.js";

/**
 * Напоминания. Идемпотентно — можно вызывать сколько угодно часто:
 * - Vercel Cron раз в сутки (вечером): «завтра в …» для всех записей на завтра;
 * - pg_cron каждые 15 минут (опционально): за 24 ч и за 2 ч.
 */
export async function runReminders(now = new Date()) {
  const rows = await db().query<Booking & { tz: string }>(
    `select b.*, z.timezone as tz from bookings b join businesses z on z.id = b.business_id
     where b.status = 'confirmed' and z.status = 'active'
       and b.starts_at > $1 and b.starts_at < $1::timestamptz + interval '48 hours'
       and (not b.reminded_24h or not b.reminded_2h)
     order by b.starts_at limit 1000`,
    [now.toISOString()],
  );

  const cache = new Map<number, Business | null>();
  let sent = 0;
  for (const b of rows) {
    if (!cache.has(b.business_id)) cache.set(b.business_id, await getBusiness(db(), b.business_id));
    const biz = cache.get(b.business_id);
    if (!biz) continue;

    const msLeft = new Date(b.starts_at).getTime() - now.getTime();
    const tomorrow = DateTime.fromJSDate(now).setZone(biz.timezone).plus({ days: 1 }).toISODate();
    const isTomorrow = DateTime.fromJSDate(new Date(b.starts_at)).setZone(biz.timezone).toISODate() === tomorrow;
    // клиенту, записавшемуся только что, напоминание не нужно — он и так получил подтверждение
    const createdRecently = now.getTime() - new Date(b.created_at).getTime() < 30 * 60_000;

    if (!b.reminded_2h && biz.settings.remind2h && msLeft <= 2 * 3600_000) {
      if (!createdRecently) {
        await sendReminder(biz, b, "2h", now);
        sent++;
      }
      await db().query(`update bookings set reminded_2h = true, reminded_24h = true where id = $1`, [b.id]);
    } else if (!b.reminded_24h && (msLeft <= 24 * 3600_000 || isTomorrow)) {
      if (!createdRecently) {
        await sendReminder(biz, b, "24h", now);
        sent++;
      }
      await db().query(`update bookings set reminded_24h = true where id = $1`, [b.id]);
    }
  }

  // прошедшие визиты считаем состоявшимися (для статистики выручки); админ может поправить на «не пришёл»
  await db().query(
    `update bookings set status = 'done' where status = 'confirmed' and ends_at < $1::timestamptz - interval '12 hours'`,
    [now.toISOString()],
  );
  return { checked: rows.length, sent };
}
