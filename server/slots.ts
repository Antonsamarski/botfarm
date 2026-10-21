import { DateTime } from "luxon";

/** ISO-день недели ("1" = пн … "7" = вс) → интервалы работы ["10:00","19:00"]. */
export type WorkHours = Partial<Record<string, [string, string][]>>;

export interface BusyInterval {
  start: string | Date;
  end: string | Date;
}

export interface SlotInput {
  /** Дата в часовом поясе бизнеса, YYYY-MM-DD */
  date: string;
  tz: string;
  workHours: WorkHours;
  stepMin: number;
  durationMin: number;
  /** Занятые интервалы (записи, выходные), любые зоны */
  busy: BusyInterval[];
  now: Date;
  /** Минимум минут от «сейчас» до начала записи */
  minLeadMin: number;
  /** На сколько дней вперёд можно записаться (0 — только сегодня) */
  maxDaysAhead: number;
}

export interface Slot {
  start: string; // ISO UTC
  end: string; // ISO UTC
  label: string; // HH:mm местного времени
}

const toMs = (v: string | Date) => (v instanceof Date ? v.getTime() : Date.parse(v));

function parseHM(day: DateTime, hm: string): DateTime {
  const [h, m] = hm.split(":").map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

export function computeSlots(input: SlotInput): Slot[] {
  const { tz, stepMin, durationMin } = input;
  const day = DateTime.fromISO(input.date, { zone: tz }).startOf("day");
  if (!day.isValid || stepMin <= 0 || durationMin <= 0) return [];

  const today = DateTime.fromJSDate(input.now, { zone: tz }).startOf("day");
  const daysAhead = Math.round(day.diff(today, "days").days);
  if (daysAhead < 0 || daysAhead > input.maxDaysAhead) return [];

  const intervals = input.workHours[String(day.weekday)] ?? [];
  const earliest = input.now.getTime() + input.minLeadMin * 60_000;
  const busy = input.busy.map((b) => [toMs(b.start), toMs(b.end)] as const);
  const durMs = durationMin * 60_000;

  const result: Slot[] = [];
  for (const [from, to] of intervals) {
    const windowStart = parseHM(day, from);
    const windowEnd = parseHM(day, to);
    for (let t = windowStart; t.plus({ minutes: durationMin }) <= windowEnd; t = t.plus({ minutes: stepMin })) {
      const s = t.toMillis();
      const e = s + durMs;
      if (s < earliest) continue;
      if (busy.some(([bs, be]) => s < be && bs < e)) continue;
      result.push({
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        label: t.toFormat("HH:mm"),
      });
    }
  }
  return result;
}

/** Список дат YYYY-MM-DD от сегодня (в поясе бизнеса) на n дней. */
export function upcomingDates(now: Date, tz: string, n: number): string[] {
  const start = DateTime.fromJSDate(now, { zone: tz }).startOf("day");
  return Array.from({ length: n }, (_, i) => start.plus({ days: i }).toISODate()!);
}

/** Границы суток даты в UTC — для выборки занятости из БД. */
export function dayBoundsUtc(date: string, tz: string): { from: string; to: string } {
  const d = DateTime.fromISO(date, { zone: tz }).startOf("day");
  return { from: d.toUTC().toISO()!, to: d.plus({ days: 1 }).toUTC().toISO()! };
}
