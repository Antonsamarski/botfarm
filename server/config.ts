const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  get botToken() {
    return env("BOT_TOKEN");
  },
  get botUsername() {
    return env("BOT_USERNAME").replace(/^@/, "");
  },
  /** Короткое имя Mini App из BotFather (/newapp). Необязательно. */
  get botAppName() {
    return env("BOT_APP_NAME");
  },
  get superadmins(): number[] {
    return env("SUPERADMIN_IDS")
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
  },
  /** Адрес сайта: https://xxx.vercel.app */
  get publicUrl() {
    const explicit = env("PUBLIC_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const v = env("VERCEL_PROJECT_PRODUCTION_URL");
    return v ? `https://${v}` : "http://localhost:5173";
  },
  get webhookSecret() {
    return env("WEBHOOK_SECRET");
  },
  get cronSecret() {
    return env("CRON_SECRET");
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
