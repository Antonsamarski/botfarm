import { DateTime } from "luxon";

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** «пн, 2 ноября, 10:00» в часовом поясе бизнеса */
export function fmtWhen(at: Date | string, tz: string): string {
  return DateTime.fromJSDate(new Date(at)).setZone(tz).setLocale("ru").toFormat("ccc, d MMMM, HH:mm");
}

export function fmtTime(at: Date | string, tz: string): string {
  return DateTime.fromJSDate(new Date(at)).setZone(tz).toFormat("HH:mm");
}

/** «сегодня» / «завтра» / «в пн, 2 ноября» */
export function relDay(at: Date | string, tz: string, now = new Date()): string {
  const d = DateTime.fromJSDate(new Date(at)).setZone(tz).startOf("day");
  const t = DateTime.fromJSDate(now).setZone(tz).startOf("day");
  const diff = Math.round(d.diff(t, "days").days);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return d.setLocale("ru").toFormat("ccc, d MMMM");
}

export const rub = (n: number, from = false) => (n === 0 ? "бесплатно" : `${from ? "от " : ""}${n.toLocaleString("ru-RU")} ₽`);
