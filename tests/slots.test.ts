import { describe, expect, it } from "vitest";
import { computeSlots, type SlotInput } from "../server/slots";

const base: SlotInput = {
  date: "2026-11-02", // понедельник
  tz: "Europe/Samara", // UTC+4
  workHours: { "1": [["10:00", "13:00"]] },
  stepMin: 30,
  durationMin: 60,
  busy: [],
  now: new Date("2026-11-01T00:00:00Z"),
  minLeadMin: 0,
  maxDaysAhead: 30,
};

const labels = (input: Partial<SlotInput>) => computeSlots({ ...base, ...input }).map((s) => s.label);

describe("computeSlots", () => {
  it("кладёт услугу целиком в рабочее время", () => {
    expect(labels({})).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
  });

  it("возвращает время начала в UTC с учётом часового пояса бизнеса", () => {
    const [first] = computeSlots(base);
    expect(first.start).toBe("2026-11-02T06:00:00.000Z");
    expect(first.end).toBe("2026-11-02T07:00:00.000Z");
  });

  it("исключает слоты, пересекающиеся с занятыми интервалами", () => {
    const busy = [{ start: "2026-11-02T07:00:00Z", end: "2026-11-02T08:00:00Z" }]; // 11:00–12:00 местного
    expect(labels({ busy })).toEqual(["10:00", "12:00"]);
  });

  it("не предлагает прошедшее время и соблюдает запас до записи", () => {
    const now = new Date("2026-11-02T06:40:00Z"); // 10:40 местного
    expect(labels({ now, minLeadMin: 60 })).toEqual(["12:00"]);
  });

  it("выходной день — пусто", () => {
    expect(labels({ date: "2026-11-03" })).toEqual([]);
  });

  it("дальше горизонта записи — пусто", () => {
    expect(labels({ maxDaysAhead: 0 })).toEqual([]);
  });

  it("поддерживает перерыв (несколько интервалов в день)", () => {
    const workHours = { "1": [["10:00", "11:00"], ["14:00", "15:30"]] as [string, string][] };
    expect(labels({ workHours })).toEqual(["10:00", "14:00", "14:30"]);
  });

  it("слот длиннее рабочего окна не помещается", () => {
    expect(labels({ durationMin: 240 })).toEqual([]);
  });
});
