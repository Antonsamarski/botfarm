// Локальный запуск без Telegram и Supabase: встроенный Postgres (PGlite), фейковая подпись initData,
// сообщения бота печатаются в консоль. Запуск: npm run build && npm run local → http://localhost:8787/?devUser=1
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

process.env.BOT_TOKEN ||= "100000:LOCAL_DEV_TOKEN";
process.env.BOT_USERNAME ||= "local_farm_bot";
process.env.SUPERADMIN_IDS ||= "1";
process.env.PUBLIC_URL ||= "http://localhost:8787";

const { createPgliteDb } = await import("../server/pglite");
const { setDb } = await import("../server/db");
const { setSender } = await import("../server/telegram");
const { handle } = await import("../server/handler");
const store = await import("../server/store");

const db = await createPgliteDb();
setDb(db);
setSender({
  sendMessage: async (chatId, html) => console.log(`\n📨 → ${chatId}\n${html.replace(/<[^>]+>/g, "")}`),
  sendPhoto: async () => ({ file_id: `local-${Date.now()}` }),
  setChatMenuButton: async () => ({}),
});

// демо-данные: по бизнесу на каждый шаблон, владелец первого — пользователь 2
const demo: [string, string][] = [
  ["beauty", "Ногти Анны"],
  ["barber", "Барбершоп Борода"],
  ["tutor", "Математика с Ильёй"],
  ["wellness", "Массаж Ольги"],
  ["auto", "Детейлинг 63"],
];
for (const [i, [tpl, name]] of demo.entries()) {
  const b = await store.createBusinessFromTemplate(db, { templateId: tpl, name, ownerTgId: i === 0 ? 2 : undefined, timezone: "Europe/Samara" });
  if (i === 0) {
    await store.updateBusiness(db, b.id, {
      settings: {
        address: "Самара, ул. Ленинградская, 45",
        contactPhone: "+7 927 000-00-00",
        description: "Аппаратный маникюр, укрепление, дизайн. Стерильные инструменты 🧼",
        links: [{ title: "Instagram", url: "https://instagram.com" }, { title: "Канал", url: "https://t.me/telegram" }],
        bannerFileId: "demo-banner",
      },
    });
    for (let k = 0; k < 6; k++) {
      await db.query(`insert into portfolio (business_id, file_id, caption, sort) values ($1, $2, '', $3)`, [b.id, `demo-${k}`, k]);
    }
  }
}

function signInit(userId: number, start: string) {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: userId === 1 ? "Антон" : userId === 2 ? "Анна" : `Гость ${userId}` }),
  };
  if (start) fields.start_param = start;
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}

const dist = join(process.cwd(), "dist");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost:8787");
  try {
    if (url.pathname === "/api/dev-init") {
      res.end(signInit(Number(url.searchParams.get("user") ?? 1), url.searchParams.get("start") ?? ""));
      return;
    }
    // фото хранятся в Telegram, которого локально нет — отдаём картинку-заглушку
    if (url.pathname === "/api/photo") {
      const hue = (Number(url.searchParams.get("banner") ?? url.searchParams.get("id")) * 47) % 360;
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,62%)"/><stop offset="1" stop-color="hsl(${hue + 60},60%,35%)"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1200" cy="260" r="160" fill="hsl(${hue + 30},90%,85%)" opacity=".85"/><path d="M0 700 L400 420 L700 620 L1050 360 L1600 680 L1600 900 L0 900Z" fill="hsl(${hue + 90},40%,25%)" opacity=".8"/><circle cx="380" cy="230" r="70" fill="#fff" opacity=".5"/></svg>`);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
      });
      const r = await handle(request);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let file = join(dist, url.pathname === "/" ? "index.html" : url.pathname);
    if (!existsSync(file)) file = join(dist, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(8787, () => console.log("Локально: http://localhost:8787/?devUser=1  (1 — суперадмин, 2 — владелец «Ногти Анны», 3+ — клиенты)"));
