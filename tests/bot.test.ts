import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb } from "../server/pglite";
import { db, setDb } from "../server/db";
import { createBusinessFromTemplate, createInvite, roleFor } from "../server/store";
import { setSender } from "../server/telegram";

process.env.BOT_TOKEN = "123:TEST";
process.env.BOT_USERNAME = "farm_test_bot";
process.env.SUPERADMIN_IDS = "1";
process.env.PUBLIC_URL = "https://farm.example";

const calls: { method: string; payload: any }[] = [];
let bot: any;

beforeAll(async () => {
  const { getBot } = await import("../server/bot");
  bot = getBot();
  bot.api.config.use(async (_prev: any, method: string, payload: any) => {
    calls.push({ method, payload });
    return { ok: true, result: method === "sendMessage" ? { message_id: 1, date: 0, chat: { id: payload.chat_id, type: "private" } } : true };
  });
});

beforeEach(async () => {
  setDb(await createPgliteDb());
  calls.length = 0;
  setSender({ sendMessage: async () => ({}), sendPhoto: async () => ({ file_id: "x" }), setChatMenuButton: async () => ({}) });
});

let updateId = 1;
const start = (from: number, payload = "") =>
  bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: from, type: "private", first_name: "T" },
      from: { id: from, is_bot: false, first_name: "T" },
      text: payload ? `/start ${payload}` : "/start",
      entities: [{ type: "bot_command", offset: 0, length: 6 }],
    },
  });

const replies = () => calls.filter((c) => c.method === "sendMessage");

describe("бот", () => {
  it("/start <slug> показывает только этот бизнес с кнопкой записи и ставит кнопку меню", async () => {
    const b = await createBusinessFromTemplate(db(), { templateId: "barber", name: "Борода" });
    await start(300, b.slug);
    const msg = replies()[0].payload;
    expect(msg.text).toContain("Борода");
    expect(JSON.stringify(msg.reply_markup)).toContain(`?b=${b.slug}`);
    expect(calls.some((c) => c.method === "setChatMenuButton" && c.payload.chat_id === 300)).toBe(true);

    calls.length = 0;
    await start(300); // без параметра — тот же бизнес
    expect(replies()[0].payload.text).toContain("Борода");
  });

  it("/start без истории — нет кнопки создания бизнеса", async () => {
    await start(400);
    const msg = replies()[0].payload;
    expect(msg.text).toContain("откройте ссылку вашего мастера");
    expect(JSON.stringify(msg.reply_markup ?? {})).not.toContain("onboard");
  });

  it("ссылка adm_ открывает панель только админу, остальным — запись", async () => {
    const b = await createBusinessFromTemplate(db(), { templateId: "beauty", name: "Ногти", ownerTgId: 500 });
    await start(500, `adm_${b.slug}`);
    expect(JSON.stringify(replies()[0].payload.reply_markup)).toContain("view=admin");
    calls.length = 0;
    await start(600, `adm_${b.slug}`);
    const msg = replies()[0].payload;
    expect(JSON.stringify(msg.reply_markup)).not.toContain("view=admin");
    expect(msg.text).toContain("Ногти");
  });

  it("приглашение делает владельцем", async () => {
    const b = await createBusinessFromTemplate(db(), { templateId: "beauty", name: "Ногти" });
    const code = await createInvite(db(), b.id, "owner", 1);
    await start(500, `inv_${code}`);
    expect(await roleFor(db(), 500, b.id, [])).toBe("owner");
    expect(replies()[0].payload.text).toContain("владелец");
  });
});
