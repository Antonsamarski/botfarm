import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb } from "../server/pglite";
import { setDb } from "../server/db";
import { setSender } from "../server/telegram";
import { dispatch } from "../server/rpc";
import { runReminders } from "../server/cron";
import { claimInvite } from "../server/store";
import type { InitData } from "../server/auth";

process.env.BOT_TOKEN = "123:TEST";
process.env.BOT_USERNAME = "farm_test_bot";
process.env.SUPERADMIN_IDS = "1, 2";
process.env.PUBLIC_URL = "https://farm.example";

let sent: { chatId: number; html: string }[] = [];
const as = (id: number, startParam?: string): { init: InitData; now?: Date } => ({
  init: { user: { id, first_name: `U${id}` }, startParam, authDate: 0 },
});
const call = (method: string, params: Record<string, unknown>, ctx = as(1)) => dispatch(method, params, ctx);

let biz: any;
let ownerInvite: string;

beforeEach(async () => {
  setDb(await createPgliteDb());
  sent = [];
  setSender({
    sendMessage: async (chatId, html) => void sent.push({ chatId, html }),
    sendPhoto: async () => ({ file_id: "FILE123" }),
    setChatMenuButton: async () => ({}),
  });
  const res: any = await call("super.create", { templateId: "beauty", name: "Ногти Анны" });
  biz = res.business;
  ownerInvite = res.ownerInvite;
});

describe("роли", () => {
  it("суперадмин создаёт бизнес и получает ссылку-приглашение владельца", () => {
    expect(biz.slug).toBe("nogti-anny");
    expect(ownerInvite).toMatch(/^https:\/\/t\.me\/farm_test_bot\?start=inv_/);
  });

  it("обычный пользователь не видит панели супер и чужого бизнеса", async () => {
    await expect(call("super.list", {}, as(300))).rejects.toThrow("Нет доступа");
    await expect(call("admin.overview", { businessId: biz.id }, as(300))).rejects.toThrow("Нет доступа");
  });

  it("после приглашения владелец управляет своим бизнесом", async () => {
    await claimInvite((await import("../server/db")).db(), ownerInvite.split("inv_")[1], 200);
    const ov: any = await call("admin.overview", { businessId: biz.id }, as(200));
    expect(ov.role).toBe("owner");
    expect(ov.links.client).toBe("https://t.me/farm_test_bot?start=nogti-anny");
  });

  it("помощник (admin) не может делать рассылку", async () => {
    const { db } = await import("../server/db");
    const inv: any = await call("admin.invite", { businessId: biz.id, role: "admin" });
    await claimInvite(db(), inv.link.split("inv_")[1], 250);
    await expect(call("admin.broadcast", { businessId: biz.id, text: "Акция!" }, as(250))).rejects.toThrow("владельцу");
  });
});

describe("клиентский путь", () => {
  it("клиент по ссылке видит только этот бизнес, записывается, админ получает уведомление", async () => {
    const { db } = await import("../server/db");
    await claimInvite(db(), ownerInvite.split("inv_")[1], 200);

    const boot: any = await call("boot", {}, as(300, "nogti-anny"));
    expect(boot.business.slug).toBe("nogti-anny");
    expect(boot.business.services.length).toBe(6);
    expect(boot.role).toBeNull();

    // повторный вход без параметра — тот же бизнес
    const boot2: any = await call("boot", {}, as(300));
    expect(boot2.business.slug).toBe("nogti-anny");

    const service = boot.business.services[1];
    const av: any = await call("availability", { businessId: biz.id, serviceId: service.id, days: 14 }, as(300));
    const firstDay = Object.keys(av)[0];
    const slot = av[firstDay][0];
    const res: any = await call(
      "book",
      { businessId: biz.id, serviceId: service.id, start: slot.start, name: "Оля", phone: "+79991112233" },
      as(300),
    );
    expect(res.id).toBeGreaterThan(0);
    expect(sent.find((m) => m.chatId === 200)?.html).toContain("Новая запись");
    expect(sent.find((m) => m.chatId === 300)?.html).toContain("Вы записаны");

    const mine: any = await call("myBookings", { businessId: biz.id }, as(300));
    expect(mine.length).toBe(1);
    // имя с HTML не ломает сообщения
    expect(sent.every((m) => !m.html.includes("<script"))).toBe(true);
  });

  it("отмена админом уведомляет клиента", async () => {
    const boot: any = await call("boot", {}, as(300, "nogti-anny"));
    const service = boot.business.services[0];
    const av: any = await call("availability", { businessId: biz.id, serviceId: service.id, days: 14 }, as(300));
    const slot = av[Object.keys(av)[0]][0];
    const { id } = (await call(
      "book",
      { businessId: biz.id, serviceId: service.id, start: slot.start, name: "<script>", phone: "+7999" },
      as(300),
    )) as any;
    sent = [];
    await call("admin.cancelBooking", { businessId: biz.id, bookingId: id });
    expect(sent.find((m) => m.chatId === 300)?.html).toContain("Запись отменена");
  });

  it("создавать бизнесы могут только суперадмины — ни клиент, ни владелец не могут", async () => {
    await expect(call("createOwnBusiness", { templateId: "auto", name: "Детейлинг" }, as(500))).rejects.toThrow("Неизвестный метод");
    await expect(call("super.create", { templateId: "auto", name: "Детейлинг" }, as(500))).rejects.toThrow("Нет доступа");
    const { db } = await import("../server/db");
    await claimInvite(db(), ownerInvite.split("inv_")[1], 200);
    await expect(call("super.create", { templateId: "auto", name: "Ещё один" }, as(200))).rejects.toThrow("Нет доступа");
  });

  it("баннер: админ загружает, клиент видит file_id, админ убирает", async () => {
    await call("admin.bannerSet", { businessId: biz.id, imageBase64: Buffer.alloc(5000, 1).toString("base64") });
    const boot: any = await call("boot", {}, as(300, "nogti-anny"));
    expect(boot.business.settings.bannerFileId).toBe("FILE123");
    // обычное сохранение настроек не затирает баннер
    await call("admin.saveSettings", { businessId: biz.id, settings: { description: "Новое", bannerFileId: "HACK" } });
    const again: any = await call("boot", {}, as(300, "nogti-anny"));
    expect(again.business.settings.bannerFileId).toBe("FILE123");
    await call("admin.bannerRemove", { businessId: biz.id });
    const after: any = await call("boot", {}, as(300, "nogti-anny"));
    expect(after.business.settings.bannerFileId).toBe("");
    await expect(call("admin.bannerSet", { businessId: biz.id, imageBase64: "x" }, as(300))).rejects.toThrow("Нет доступа");
  });

  it("заблокированный бизнес не показывается клиентам", async () => {
    await call("super.setStatus", { businessId: biz.id, status: "blocked" });
    const boot: any = await call("boot", {}, as(301, "nogti-anny"));
    expect(boot.business).toBeNull();
    expect(boot.blocked).toBe(true);
  });
});

describe("напоминания", () => {
  it("шлёт напоминание о завтрашней записи один раз", async () => {
    const { db } = await import("../server/db");
    const [svc] = await db().query(`select * from services where business_id = $1 order by sort`, [biz.id]);
    const [staff] = await db().query(`select * from staff where business_id = $1`, [biz.id]);
    const start = new Date(Date.now() + 20 * 3600_000);
    await db().query(
      `insert into bookings (business_id, staff_id, service_id, service_title, client_tg_id, client_name, starts_at, ends_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now() - interval '2 days')`,
      [biz.id, staff.id, svc.id, svc.title, 300, "Оля", start.toISOString(), new Date(start.getTime() + 3600_000).toISOString()],
    );
    const r1 = await runReminders();
    const r2 = await runReminders();
    expect(r1.sent).toBe(1);
    expect(r2.sent).toBe(0);
    expect(sent.filter((m) => m.chatId === 300)[0].html).toContain("Напоминаем");
  });
});
