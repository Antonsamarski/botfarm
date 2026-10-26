import { createHmac } from "node:crypto";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

/** Данные, подгружаемые на лету: юзернейм бота из getMe и суперадмины из таблицы platform_admins. */
export const runtime = { botUsername: "", dbSuperadmins: [] as number[], requestHost: "" };

/**
 * Основной адрес проекта на Vercel: `<проект>.vercel.app`. Адреса отдельных сборок выглядят как
 * `<проект>-<хеш>-<команда>.vercel.app` или содержат `-git-` — их за основной не считаем.
 */
export function isProductionHost(host: string): boolean {
  if (!/^[a-z0-9-]+\.vercel\.app$/.test(host)) return false;
  const name = host.replace(/\.vercel\.app$/, "");
  if (name.includes("-git-")) return false;
  return !/-[a-z0-9]{9}-/.test(`${name}-`);
}

/** Секрет, производный от токена бота, — чтобы не заводить лишних переменных окружения. */
const derived = (purpose: string) =>
  config.botToken ? createHmac("sha256", config.botToken).update(purpose).digest("base64url").slice(0, 40) : "";

export const config = {
  get botToken() {
    return env("BOT_TOKEN");
  },
  get botUsername() {
    return (env("BOT_USERNAME") || runtime.botUsername).replace(/^@/, "");
  },
  /** Короткое имя Mini App из BotFather (/newapp). Необязательно. */
  get botAppName() {
    return env("BOT_APP_NAME");
  },
  get superadmins(): number[] {
    const fromEnv = env("SUPERADMIN_IDS")
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set([...fromEnv, ...runtime.dbSuperadmins])];
  },
  /** Адрес сайта: https://xxx.vercel.app */
  get publicUrl() {
    const explicit = env("PUBLIC_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const v = env("VERCEL_PROJECT_PRODUCTION_URL");
    if (v) return `https://${v}`;
    // системные переменные Vercel недоступны — берём адрес из запроса, если это основной домен проекта
    if (isProductionHost(runtime.requestHost)) return `https://${runtime.requestHost}`;
    return "http://localhost:5173";
  },
  get webhookSecret() {
    return env("WEBHOOK_SECRET") || derived("webhook");
  },
  get cronSecret() {
    return env("CRON_SECRET") || derived("cron");
  },
  get isProduction() {
    if (env("VERCEL_ENV")) return env("VERCEL_ENV") === "production";
    return isProductionHost(runtime.requestHost) && `https://${runtime.requestHost}` === config.publicUrl;
  },
};

export function clientLink(slug: string): string {
  return config.botAppName
    ? `https://t.me/${config.botUsername}/${config.botAppName}?startapp=${slug}`
    : `https://t.me/${config.botUsername}?start=${slug}`;
}

export const inviteLink = (code: string) => `https://t.me/${config.botUsername}?start=inv_${code}`;

/** URL Mini App с выбранным бизнесом и экраном. */
export function webAppUrl(params: { b?: string; view?: string } = {}): string {
  const q = new URLSearchParams();
  if (params.b) q.set("b", params.b);
  if (params.view) q.set("view", params.view);
  const s = q.toString();
  return `${config.publicUrl}/${s ? `?${s}` : ""}`;
}
