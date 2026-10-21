import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb } from "../server/pglite";
import type { Db } from "../server/db";
import {
  availability,
  BookingConflict,
  cancelBooking,
  claimInvite,
  createBooking,
  createBusinessFromTemplate,
  createInvite,
  roleFor,
  slugify,
  UserError,
  type Business,
} from "../server/store";

let db: Db;
let biz: Business;
// понедельник 2 ноября 2026, 08:00 по Москве
const now = new Date("2026-11-02T05:00:00Z");

beforeEach(async () => {
  db = await createPgliteDb();
  biz = await createBusinessFromTemplate(db, { templateId: "beauty", name: "Ногти Анны", ownerTgId: 100 });
});

const firstService = async () => (await db.query(`select * from services where business_id = $1 order by sort`, [biz.id]))[0];

describe("бизнесы из шаблона", () => {
  it("создаёт бизнес с услугами, мастером и владельцем", async () => {
    expect(biz.slug).toBe("nogti-anny");
    const services = await db.query(`select * from services where business_id = $1`, [biz.id]);
    expect(services.length).toBe(6);
    expect(await roleFor(db, 100, biz.id, [])).toBe("owner");
    expect(await roleFor(db, 555, biz.id, [555])).toBe("super");
    expect(await roleFor(db, 777, biz.id, [])).toBeNull();
  });

  it("при совпадении названия делает уникальную ссылку", async () => {
    const b2 = await createBusinessFromTemplate(db, { templateId: "beauty", name: "Ногти Анны" });
    expect(b2.slug).not.toBe(biz.slug);
    expect(b2.slug.startsWith("nogti-anny-")).toBe(true);
  });

  it("slugify переводит кириллицу", () => {
    expect(slugify("Барбершоп Борода!")).toBe("barbershop-boroda");
  });
});

describe("приглашения", () => {
  it("делают человека владельцем и одноразовые", async () => {
    const code = await createInvite(db, biz.id, "owner", 1);
    const res = await claimInvite(db, code, 200);
    expect(res.business.id).toBe(biz.id);
    expect(await roleFor(db, 200, biz.id, [])).toBe("owner");
    await expect(claimInvite(db, code, 300)).rejects.toThrow(UserError);
  });
});

describe("запись", () => {
  it("показывает слоты только в рабочее время и в будущем", async () => {
    const svc = await firstService(); // 120 мин
    const av = await availability(db, { business: biz, serviceId: svc.id, days: 2, now });
    const today = av["2026-11-02"];
    expect(today[0].label).toBe("10:00"); // работает с 10, сейчас 08:00 + час запаса
    expect(today.at(-1)!.label).toBe("18:00"); // 18:00 + 2 ч = 20:00 конец смены
  });

  it("не даёт записать двоих на одно время, даже одновременно", async () => {
    const svc = await firstService();
    const start = "2026-11-02T07:00:00.000Z"; // 10:00 МСК
    const mk = (tgId: number) =>
      createBooking(db, { business: biz, serviceId: svc.id, start, client: { tgId, name: "Клиент", phone: "+79990000000" }, now });
    const results = await Promise.allSettled([mk(1), mk(2)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBe(1);
    expect(fail[0].reason).toBeInstanceOf(BookingConflict);
  });

  it("запись блокирует пересекающиеся слоты для следующего клиента", async () => {
    const svc = await firstService(); // 120 мин
    await createBooking(db, {
      business: biz,
      serviceId: svc.id,
      start: "2026-11-02T08:00:00.000Z", // 11:00–13:00 МСК
      client: { tgId: 1, name: "Аня", phone: "+7999" },
      now,
    });
    const av = await availability(db, { business: biz, serviceId: svc.id, days: 1, now });
    const labels = av["2026-11-02"].map((s) => s.label);
    expect(labels).not.toContain("10:00"); // 10–12 пересекается
    expect(labels).not.toContain("12:30");
    expect(labels).toContain("13:00");
  });

  it("отклоняет время вне сетки и прошлое", async () => {
    const svc = await firstService();
    const bad = (start: string) =>
      createBooking(db, { business: biz, serviceId: svc.id, start, client: { tgId: 1, name: "Аня", phone: "+7999" }, now });
    await expect(bad("2026-11-02T04:00:00.000Z")).rejects.toThrow(BookingConflict); // 07:00 — до открытия
    await expect(bad("2026-11-01T08:00:00.000Z")).rejects.toThrow(BookingConflict); // вчера
  });

  it("клиент отменяет только свою запись и не позже срока", async () => {
    const svc = await firstService();
    const b = await createBooking(db, {
      business: biz,
      serviceId: svc.id,
      start: "2026-11-02T10:00:00.000Z",
      client: { tgId: 1, name: "Аня", phone: "+7999" },
      now,
    });
    await expect(cancelBooking(db, { bookingId: b.id, business: biz, by: "client", tgId: 2, now })).rejects.toThrow("не ваша");
    const late = new Date("2026-11-02T08:30:00Z"); // за 1.5 ч, а лимит 3 ч
    await expect(cancelBooking(db, { bookingId: b.id, business: biz, by: "client", tgId: 1, now: late })).rejects.toThrow();
    const c = await cancelBooking(db, { bookingId: b.id, business: biz, by: "client", tgId: 1, now });
    expect(c.status).toBe("cancelled");
    // отменённая запись освобождает время
    const again = await createBooking(db, {
      business: biz,
      serviceId: svc.id,
      start: "2026-11-02T10:00:00.000Z",
      client: { tgId: 3, name: "Оля", phone: "+7998" },
      now,
    });
    expect(again.id).toBeGreaterThan(b.id);
  });

  it("«любой мастер» в барбершопе распределяет по свободным", async () => {
    const barber = await createBusinessFromTemplate(db, { templateId: "barber", name: "Борода" });
    const [svc] = await db.query(`select * from services where business_id = $1 order by sort`, [barber.id]);
    const start = "2026-11-03T10:00:00.000Z"; // вт 13:00 МСК, работают оба
    const mk = (tgId: number) =>
      createBooking(db, { business: barber, serviceId: svc.id, start, client: { tgId, name: "Иван", phone: "+7" }, now });
    const a = await mk(1);
    const b = await mk(2);
    expect(a.staff_id).not.toBe(b.staff_id);
    await expect(mk(3)).rejects.toThrow(BookingConflict);
  });

  it("требует обязательные поля анкеты шаблона", async () => {
    const auto = await createBusinessFromTemplate(db, { templateId: "auto", name: "Детейлинг 63" });
    const [svc] = await db.query(`select * from services where business_id = $1 order by sort`, [auto.id]);
    await expect(
      createBooking(db, {
        business: auto,
        serviceId: svc.id,
        start: "2026-11-02T08:00:00.000Z",
        client: { tgId: 1, name: "Антон", phone: "+7" },
        now,
      }),
    ).rejects.toThrow("Марка и модель");
  });
});
