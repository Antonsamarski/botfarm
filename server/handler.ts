import { webhookCallback } from "grammy";
import { AuthError, verifyInitData } from "./auth.js";
import { getBot } from "./bot.js";
import { config, webAppUrl } from "./config.js";
import { db } from "./db.js";
import { runReminders } from "./cron.js";
import { dispatch } from "./rpc.js";
import { UserError } from "./store.js";
import { rawApi } from "./telegram.js";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

let webhook: ((req: Request) => Promise<Response>) | null = null;

function cronAuthorized(req: Request, url: URL): boolean {
  const secret = config.cronSecret;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret;
}

async function rpc(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const init = verifyInitData(req.headers.get("x-init-data") ?? "", config.botToken);
    const body = (await req.json()) as { method?: string; params?: Record<string, unknown> };
    const result = await dispatch(String(body.method ?? ""), body.params ?? {}, { init });
    return json({ result });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error("rpc error", e);
    return json({ error: "Что-то пошло не так. Попробуйте ещё раз." }, 500);
  }
}

/** Фото портфолио: файл хранится в Telegram, отдаём через CDN Vercel с долгим кэшем. */
async function photo(url: URL): Promise<Response> {
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return new Response("bad id", { status: 400 });
  const [row] = await db().query(`select file_id from portfolio where id = $1`, [id]);
  if (!row) return new Response("not found", { status: 404 });
  const file = await rawApi().getFile(row.file_id);
  const res = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`);
  if (!res.ok) return new Response("upstream error", { status: 502 });
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}

/** Одноразовая настройка: вебхук, команды, кнопка меню, описание. */
async function setup(): Promise<Response> {
  const api = rawApi();
  const base = config.publicUrl;
  await api.setWebhook(`${base}/api/bot`, {
    secret_token: config.webhookSecret || undefined,
    allowed_updates: ["message", "my_chat_member"],
    drop_pending_updates: true,
  });
  await api.setMyCommands([
    { command: "start", description: "Главное меню" },
    { command: "admin", description: "Панель для владельцев бизнеса" },
    { command: "help", description: "Помощь" },
  ]);
  await api.setChatMenuButton({ menu_button: { type: "web_app", text: "Открыть", web_app: { url: webAppUrl() } } });
  await api.setMyShortDescription("Онлайн-запись к мастерам и в салоны прямо в Telegram");
  await api.setMyDescription(
    "Записывайтесь к мастеру в пару касаний: выбор услуги, удобное время, напоминания. Предпринимателям — бесплатная онлайн-запись для бизнеса.",
  );
  const info = await api.getWebhookInfo();
  return json({ ok: true, webhook: info.url, pending: info.pending_update_count });
}

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = url.searchParams.get("route") || url.pathname.replace(/^\/api\/?/, "");

  switch (route) {
    case "rpc":
      return rpc(req);
    case "bot": {
      if (config.webhookSecret && req.headers.get("x-telegram-bot-api-secret-token") !== config.webhookSecret) {
        return new Response("forbidden", { status: 403 });
      }
      webhook ??= webhookCallback(getBot(), "std/http", { timeoutMilliseconds: 25_000 });
      return webhook(req);
    }
    case "photo":
      return photo(url);
    case "cron":
      if (!cronAuthorized(req, url)) return new Response("forbidden", { status: 403 });
      return json(await runReminders());
    case "setup":
      if (!cronAuthorized(req, url)) return new Response("forbidden", { status: 403 });
      return setup();
    case "health":
      await db().query("select 1");
      return json({ ok: true });
    default:
      return json({ error: "not found" }, 404);
  }
}
