var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/config.ts
import { createHmac as createHmac2 } from "node:crypto";
function clientLink(slug) {
  return config.botAppName ? `https://t.me/${config.botUsername}/${config.botAppName}?startapp=${slug}` : `https://t.me/${config.botUsername}?start=${slug}`;
}
function webAppUrl(params = {}) {
  const q = new URLSearchParams();
  if (params.b) q.set("b", params.b);
  if (params.view) q.set("view", params.view);
  const s = q.toString();
  return `${config.publicUrl}/${s ? `?${s}` : ""}`;
}
var env, runtime, derived, config, inviteLink;
var init_config = __esm({
  "server/config.ts"() {
    "use strict";
    env = (k, d = "") => (process.env[k] ?? d).trim();
    runtime = { botUsername: "", dbSuperadmins: [] };
    derived = (purpose) => config.botToken ? createHmac2("sha256", config.botToken).update(purpose).digest("base64url").slice(0, 40) : "";
    config = {
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
      get superadmins() {
        const fromEnv = env("SUPERADMIN_IDS").split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n > 0);
        return [.../* @__PURE__ */ new Set([...fromEnv, ...runtime.dbSuperadmins])];
      },
      /** Адрес сайта: https://xxx.vercel.app */
      get publicUrl() {
        const explicit = env("PUBLIC_URL");
        if (explicit) return explicit.replace(/\/$/, "");
        const v = env("VERCEL_PROJECT_PRODUCTION_URL");
        return v ? `https://${v}` : "http://localhost:5173";
      },
      get webhookSecret() {
        return env("WEBHOOK_SECRET") || derived("webhook");
      },
      get cronSecret() {
        return env("CRON_SECRET") || derived("cron");
      },
      get isProduction() {
        return env("VERCEL_ENV") === "production";
      }
    };
    inviteLink = (code) => `https://t.me/${config.botUsername}?start=inv_${code}`;
  }
});

// server/format.ts
import { DateTime } from "luxon";
function fmtWhen(at, tz) {
  return DateTime.fromJSDate(new Date(at)).setZone(tz).setLocale("ru").toFormat("ccc, d MMMM, HH:mm");
}
function fmtTime(at, tz) {
  return DateTime.fromJSDate(new Date(at)).setZone(tz).toFormat("HH:mm");
}
function relDay(at, tz, now = /* @__PURE__ */ new Date()) {
  const d = DateTime.fromJSDate(new Date(at)).setZone(tz).startOf("day");
  const t = DateTime.fromJSDate(now).setZone(tz).startOf("day");
  const diff = Math.round(d.diff(t, "days").days);
  if (diff === 0) return "\u0441\u0435\u0433\u043E\u0434\u043D\u044F";
  if (diff === 1) return "\u0437\u0430\u0432\u0442\u0440\u0430";
  return d.setLocale("ru").toFormat("ccc, d MMMM");
}
var esc, rub;
var init_format = __esm({
  "server/format.ts"() {
    "use strict";
    esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    rub = (n, from = false) => n === 0 ? "\u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E" : `${from ? "\u043E\u0442 " : ""}${n.toLocaleString("ru-RU")} \u20BD`;
  }
});

// server/telegram.ts
import { Api } from "grammy";
function rawApi() {
  api ??= new Api(config.botToken);
  return api;
}
function tg() {
  if (override) return override;
  const a = rawApi();
  return {
    sendMessage: (chatId, html, extra) => a.sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra }),
    sendPhoto: async (chatId, photo2, caption) => {
      const { InputFile } = await import("grammy");
      const msg = await a.sendPhoto(chatId, new InputFile(photo2), { caption });
      const sizes = msg.photo ?? [];
      return { file_id: sizes[sizes.length - 1].file_id };
    },
    setChatMenuButton: (chatId, text, url) => a.setChatMenuButton({ chat_id: chatId, menu_button: { type: "web_app", text, web_app: { url } } })
  };
}
function isBlockedError(e) {
  const err = e;
  return err?.error_code === 403 || /blocked|chat not found|deactivated/i.test(err?.description ?? "");
}
var override, api;
var init_telegram = __esm({
  "server/telegram.ts"() {
    "use strict";
    init_config();
    override = null;
    api = null;
  }
});

// server/notify.ts
var notify_exports = {};
__export(notify_exports, {
  broadcast: () => broadcast,
  notifySuperadmins: () => notifySuperadmins,
  onBookingCancelled: () => onBookingCancelled,
  onBookingCreated: () => onBookingCreated,
  sendReminder: () => sendReminder
});
async function safeSend(chatId, html, extra) {
  try {
    await tg().sendMessage(chatId, html, extra);
    return true;
  } catch (e) {
    if (!isBlockedError(e)) console.error("sendMessage", chatId, e);
    return false;
  }
}
async function adminRecipients(db2, businessId, staffId) {
  const rows = await db2.query(
    `select tg_id from business_admins where business_id = $1
     union select tg_id from staff where id = $2 and tg_id is not null`,
    [businessId, staffId ?? 0]
  );
  return rows.map((r) => Number(r.tg_id));
}
function bookingLines(b, biz, staffName2) {
  const fieldLines = biz.settings.fields.filter((f) => b.answers?.[f.key]).map((f) => `${esc(f.label)}: ${esc(b.answers[f.key])}`);
  return [
    `\u{1F5D3} <b>${esc(fmtWhen(b.starts_at, biz.timezone))}</b>`,
    `\u{1F4BC} ${esc(b.service_title)}${b.price ? ` \xB7 ${rub(b.price)}` : ""}`,
    staffName2 && biz.settings.chooseStaff ? `\u{1F464} ${esc(biz.settings.labels.staff)}: ${esc(staffName2)}` : "",
    ...fieldLines
  ].filter(Boolean).join("\n");
}
async function onBookingCreated(db2, biz, b) {
  const sName = await staffName(db2, b.staff_id);
  const adminText = [
    `\u{1F195} <b>\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C</b> \xB7 ${esc(biz.name)}`,
    "",
    bookingLines(b, biz, sName),
    `\u{1F64B} ${esc(b.client_name)}${b.client_phone ? ` \xB7 ${esc(b.client_phone)}` : ""}`,
    `<a href="tg://user?id=${b.client_tg_id}">\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0443</a>`,
    b.comment ? `\u{1F4AC} ${esc(b.comment)}` : ""
  ].filter((x) => x !== "").join("\n");
  const adminKb = webAppButton("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u0438", webAppUrl({ b: biz.slug, view: "admin" }));
  await Promise.all((await adminRecipients(db2, biz.id, b.staff_id)).map((id) => safeSend(id, adminText, adminKb)));
  const clientText = [
    `\u2705 <b>\u0412\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B!</b> ${esc(biz.settings.emoji)} ${esc(biz.name)}`,
    "",
    bookingLines(b, biz, sName),
    biz.settings.address ? `\u{1F4CD} ${esc(biz.settings.address)}` : "",
    biz.settings.afterBookingText ? `
${esc(biz.settings.afterBookingText)}` : ""
  ].filter((x) => x !== "").join("\n");
  await safeSend(b.client_tg_id, clientText, webAppButton("\u041C\u043E\u0438 \u0437\u0430\u043F\u0438\u0441\u0438", webAppUrl({ b: biz.slug, view: "my" })));
}
async function onBookingCancelled(db2, biz, b) {
  const sName = await staffName(db2, b.staff_id);
  if (b.cancelled_by === "client") {
    const text = `\u{1F6AB} <b>\u041A\u043B\u0438\u0435\u043D\u0442 \u043E\u0442\u043C\u0435\u043D\u0438\u043B \u0437\u0430\u043F\u0438\u0441\u044C</b> \xB7 ${esc(biz.name)}

${bookingLines(b, biz, sName)}
\u{1F64B} ${esc(b.client_name)}`;
    await Promise.all((await adminRecipients(db2, biz.id, b.staff_id)).map((id) => safeSend(id, text)));
  } else {
    const text = [
      `\u{1F614} <b>\u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430</b> \xB7 ${esc(biz.name)}`,
      "",
      bookingLines(b, biz, sName),
      "",
      "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435, \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0434\u0440\u0443\u0433\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u2014 \u0431\u0443\u0434\u0435\u043C \u0440\u0430\u0434\u044B \u0432\u0430\u0441 \u0432\u0438\u0434\u0435\u0442\u044C."
    ].join("\n");
    await safeSend(b.client_tg_id, text, webAppButton("\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u0441\u043D\u043E\u0432\u0430", webAppUrl({ b: biz.slug })));
  }
}
async function sendReminder(biz, b, kind, now = /* @__PURE__ */ new Date()) {
  const when = `${relDay(b.starts_at, biz.timezone, now)} \u0432 ${fmtTime(b.starts_at, biz.timezone)}`;
  const head = [
    kind === "2h" ? `\u23F0 <b>\u0421\u043A\u043E\u0440\u043E \u0432\u0438\u0437\u0438\u0442: ${esc(when)}</b>` : `\u{1F514} <b>\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u0435\u043C \u043E \u0437\u0430\u043F\u0438\u0441\u0438: ${esc(when)}</b>`,
    `${esc(biz.settings.emoji)} ${esc(biz.name)} \xB7 ${esc(b.service_title)}`
  ];
  if (biz.settings.address) head.push(`\u{1F4CD} ${esc(biz.settings.address)}`);
  const tail = kind === "24h" ? "\u0415\u0441\u043B\u0438 \u043F\u043B\u0430\u043D\u044B \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u2014 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u0437\u0430\u043F\u0438\u0441\u044C, \u0447\u0442\u043E\u0431\u044B \u0432\u0440\u0435\u043C\u044F \u0434\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u0434\u0440\u0443\u0433\u043E\u043C\u0443." : "\u0414\u043E \u0432\u0441\u0442\u0440\u0435\u0447\u0438!";
  const text = `${head.join("\n")}

${tail}`;
  return safeSend(b.client_tg_id, text, webAppButton("\u041C\u043E\u0438 \u0437\u0430\u043F\u0438\u0441\u0438", webAppUrl({ b: biz.slug, view: "my" })));
}
async function notifySuperadmins(html) {
  await Promise.all(config.superadmins.map((id) => safeSend(id, html)));
}
async function broadcast(db2, biz, text) {
  const clients = await db2.query(
    `select tg_id from clients where business_id = $1 and not blocked_bot order by last_seen desc limit 2000`,
    [biz.id]
  );
  const html = `${esc(biz.settings.emoji)} <b>${esc(biz.name)}</b>

${esc(text)}`;
  const kb = webAppButton("\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F", webAppUrl({ b: biz.slug }));
  let sent = 0;
  let failed = 0;
  const blocked = [];
  for (let i = 0; i < clients.length; i += 25) {
    const batch = clients.slice(i, i + 25);
    const res = await Promise.all(batch.map((c) => safeSend(Number(c.tg_id), html, kb)));
    res.forEach((ok, j) => {
      if (ok) sent++;
      else {
        failed++;
        blocked.push(Number(batch[j].tg_id));
      }
    });
    if (i + 25 < clients.length) await new Promise((r) => setTimeout(r, 1100));
  }
  if (blocked.length) {
    await db2.query(`update clients set blocked_bot = true where business_id = $1 and tg_id = any($2::bigint[])`, [
      biz.id,
      blocked
    ]);
  }
  return { sent, failed };
}
var webAppButton, staffName;
var init_notify = __esm({
  "server/notify.ts"() {
    "use strict";
    init_config();
    init_format();
    init_telegram();
    webAppButton = (text, url) => ({ reply_markup: { inline_keyboard: [[{ text, web_app: { url } }]] } });
    staffName = async (db2, id) => (await db2.query(`select name from staff where id = $1`, [id]))[0]?.name;
  }
});

// server/handler.ts
import { webhookCallback } from "grammy";

// server/auth.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var AuthError = class extends Error {
};
var MAX_AGE_SEC = 7 * 24 * 3600;
function verifyInitData(raw, botToken, nowMs = Date.now()) {
  if (!raw) throw new AuthError("\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) throw new AuthError("\u041D\u0435\u0442 \u043F\u043E\u0434\u043F\u0438\u0441\u0438");
  params.delete("hash");
  const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AuthError("\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u044C");
  }
  const authDate = Number(params.get("auth_date"));
  if (!authDate || nowMs / 1e3 - authDate > MAX_AGE_SEC) throw new AuthError("\u0421\u0435\u0441\u0441\u0438\u044F \u0443\u0441\u0442\u0430\u0440\u0435\u043B\u0430, \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0437\u0430\u043D\u043E\u0432\u043E");
  const userRaw = params.get("user");
  if (!userRaw) throw new AuthError("\u041D\u0435\u0442 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F");
  const user = JSON.parse(userRaw);
  return { user, startParam: params.get("start_param") ?? void 0, authDate };
}

// server/bot.ts
init_config();
import { Bot, InlineKeyboard } from "grammy";

// server/db.ts
import postgres from "postgres";
var current = null;
function db() {
  if (current) return current;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL \u043D\u0435 \u0437\u0430\u0434\u0430\u043D");
  const sql = postgres(url, {
    prepare: false,
    max: 3,
    // несколько соединений на тёплый экземпляр; остальное держит пулер Supabase
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) }
    }
  });
  current = wrapPostgres(sql);
  return current;
}
function wrapPostgres(sql) {
  return {
    query: (text, params = []) => sql.unsafe(text, params),
    tx: (fn) => sql.begin((t) => fn(wrapPostgres(t)))
  };
}
function isOverlapError(e) {
  const err = e;
  return err?.code === "23P01" || /bookings_no_overlap/.test(err?.message ?? "");
}

// server/bot.ts
init_format();

// server/store.ts
import { randomBytes } from "node:crypto";
import { DateTime as DateTime3 } from "luxon";

// server/slots.ts
import { DateTime as DateTime2 } from "luxon";
var toMs = (v) => v instanceof Date ? v.getTime() : Date.parse(v);
function parseHM(day, hm) {
  const [h, m] = hm.split(":").map(Number);
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}
function computeSlots(input) {
  const { tz, stepMin, durationMin } = input;
  const day = DateTime2.fromISO(input.date, { zone: tz }).startOf("day");
  if (!day.isValid || stepMin <= 0 || durationMin <= 0) return [];
  const today = DateTime2.fromJSDate(input.now, { zone: tz }).startOf("day");
  const daysAhead = Math.round(day.diff(today, "days").days);
  if (daysAhead < 0 || daysAhead > input.maxDaysAhead) return [];
  const intervals = input.workHours[String(day.weekday)] ?? [];
  const earliest = input.now.getTime() + input.minLeadMin * 6e4;
  const busy = input.busy.map((b) => [toMs(b.start), toMs(b.end)]);
  const durMs = durationMin * 6e4;
  const result = [];
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
        label: t.toFormat("HH:mm")
      });
    }
  }
  return result;
}
function upcomingDates(now, tz, n) {
  const start = DateTime2.fromJSDate(now, { zone: tz }).startOf("day");
  return Array.from({ length: n }, (_, i) => start.plus({ days: i }).toISODate());
}
function dayBoundsUtc(date, tz) {
  const d = DateTime2.fromISO(date, { zone: tz }).startOf("day");
  return { from: d.toUTC().toISO(), to: d.plus({ days: 1 }).toUTC().toISO() };
}

// server/templates.ts
var weekdays = (from, to, days = [1, 2, 3, 4, 5]) => Object.fromEntries(days.map((d) => [String(d), [[from, to]]]));
var baseSettings = (over) => ({
  emoji: "\u2728",
  accent: "#2481cc",
  description: "",
  address: "",
  contactPhone: "",
  links: [],
  welcome: "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0417\u0434\u0435\u0441\u044C \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043E\u043D\u043B\u0430\u0439\u043D \u0432 \u043F\u0430\u0440\u0443 \u043A\u0430\u0441\u0430\u043D\u0438\u0439.",
  afterBookingText: "",
  labels: { staff: "\u041C\u0430\u0441\u0442\u0435\u0440", staffPlural: "\u041C\u0430\u0441\u0442\u0435\u0440\u0430", service: "\u0423\u0441\u043B\u0443\u0433\u0430" },
  stepMin: 30,
  minLeadMin: 60,
  maxDaysAhead: 30,
  cancelHours: 3,
  chooseStaff: false,
  requirePhone: true,
  remind2h: true,
  fields: [],
  ...over
});
var TEMPLATES = [
  {
    id: "beauty",
    title: "\u0411\u044C\u044E\u0442\u0438-\u043C\u0430\u0441\u0442\u0435\u0440",
    emoji: "\u{1F485}",
    pitch: "\u041C\u0430\u043D\u0438\u043A\u044E\u0440, \u043F\u0435\u0434\u0438\u043A\u044E\u0440, \u0431\u0440\u043E\u0432\u0438, \u0440\u0435\u0441\u043D\u0438\u0446\u044B. \u041E\u0434\u0438\u043D \u043C\u0430\u0441\u0442\u0435\u0440, \u043F\u043E\u0440\u0442\u0444\u043E\u043B\u0438\u043E, \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F.",
    settings: baseSettings({
      emoji: "\u{1F485}",
      accent: "#d6457b",
      description: "\u041C\u0430\u043D\u0438\u043A\u044E\u0440, \u043F\u0435\u0434\u0438\u043A\u044E\u0440 \u0438 \u0431\u0440\u043E\u0432\u0438. \u0417\u0430\u043F\u0438\u0441\u044C \u043E\u043D\u043B\u0430\u0439\u043D 24/7 \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0441\u043B\u0443\u0433\u0443 \u0438 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E\u0435 \u043E\u043A\u043E\u0448\u043A\u043E.",
      welcome: "\u041F\u0440\u0438\u0432\u0435\u0442! \u042F \u043C\u0430\u0441\u0442\u0435\u0440 \u043D\u043E\u0433\u0442\u0435\u0432\u043E\u0433\u043E \u0441\u0435\u0440\u0432\u0438\u0441\u0430. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0441\u043B\u0443\u0433\u0443 \u0438 \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u2014 \u044F \u043F\u0440\u0438\u0448\u043B\u044E \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u043D\u0430\u043A\u0430\u043D\u0443\u043D\u0435 \u{1F495}",
      afterBookingText: "\u0415\u0441\u043B\u0438 \u043F\u043B\u0430\u043D\u044B \u0438\u0437\u043C\u0435\u043D\u044F\u0442\u0441\u044F \u2014 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u0437\u0430\u043F\u0438\u0441\u044C \u0432 \xAB\u041C\u043E\u0438 \u0437\u0430\u043F\u0438\u0441\u0438\xBB, \u0447\u0442\u043E\u0431\u044B \u043E\u043A\u043E\u0448\u043A\u043E \u0434\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u0434\u0440\u0443\u0433\u043E\u043C\u0443.",
      fields: [{ key: "wish", label: "\u041F\u043E\u0436\u0435\u043B\u0430\u043D\u0438\u044F \u043F\u043E \u0434\u0438\u0437\u0430\u0439\u043D\u0443", placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043D\u044E\u0434, \u043A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u0434\u043B\u0438\u043D\u0430", required: false }]
    }),
    staff: [{ name: "\u041C\u0430\u0441\u0442\u0435\u0440", work_hours: weekdays("10:00", "20:00", [1, 2, 3, 4, 5, 6]) }],
    services: [
      { title: "\u041C\u0430\u043D\u0438\u043A\u044E\u0440 \u0441 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435\u043C \u0433\u0435\u043B\u044C-\u043B\u0430\u043A", price: 1800, duration_min: 120 },
      { title: "\u041C\u0430\u043D\u0438\u043A\u044E\u0440 \u0431\u0435\u0437 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F", price: 900, duration_min: 60 },
      { title: "\u041D\u0430\u0440\u0430\u0449\u0438\u0432\u0430\u043D\u0438\u0435 \u043D\u043E\u0433\u0442\u0435\u0439", price: 2800, price_from: true, duration_min: 180 },
      { title: "\u041F\u0435\u0434\u0438\u043A\u044E\u0440 \u0441 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435\u043C", price: 2200, duration_min: 120 },
      { title: "\u041A\u043E\u0440\u0440\u0435\u043A\u0446\u0438\u044F \u0438 \u043E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u043D\u0438\u0435 \u0431\u0440\u043E\u0432\u0435\u0439", price: 1200, duration_min: 60 },
      { title: "\u0421\u043D\u044F\u0442\u0438\u0435 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F", price: 400, duration_min: 30 }
    ]
  },
  {
    id: "barber",
    title: "\u0411\u0430\u0440\u0431\u0435\u0440\u0448\u043E\u043F / \u043F\u0430\u0440\u0438\u043A\u043C\u0430\u0445\u0435\u0440",
    emoji: "\u{1F488}",
    pitch: "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0430\u0441\u0442\u0435\u0440\u043E\u0432, \u0432\u044B\u0431\u043E\u0440 \u043C\u0430\u0441\u0442\u0435\u0440\u0430 \u0438\u043B\u0438 \xAB\u043B\u044E\u0431\u043E\u0439 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0439\xBB.",
    settings: baseSettings({
      emoji: "\u{1F488}",
      accent: "#b7791f",
      description: "\u041C\u0443\u0436\u0441\u043A\u0438\u0435 \u0441\u0442\u0440\u0438\u0436\u043A\u0438 \u0438 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 \u0431\u043E\u0440\u043E\u0434\u044B. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u0430\u0441\u0442\u0435\u0440\u0430 \u0438 \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F.",
      welcome: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C! \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0441\u043B\u0443\u0433\u0443, \u043C\u0430\u0441\u0442\u0435\u0440\u0430 \u0438 \u0432\u0440\u0435\u043C\u044F \u2014 \u0431\u0435\u0437 \u0437\u0432\u043E\u043D\u043A\u043E\u0432 \u0438 \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u044F.",
      chooseStaff: true,
      stepMin: 15,
      minLeadMin: 30,
      maxDaysAhead: 21,
      cancelHours: 2
    }),
    staff: [
      { name: "\u0410\u043B\u0435\u043A\u0441\u0435\u0439", description: "\u0422\u043E\u043F-\u0431\u0430\u0440\u0431\u0435\u0440", work_hours: weekdays("10:00", "21:00", [1, 2, 3, 4, 5, 6, 7]) },
      { name: "\u0414\u043C\u0438\u0442\u0440\u0438\u0439", description: "\u0411\u0430\u0440\u0431\u0435\u0440", work_hours: weekdays("12:00", "21:00", [2, 3, 4, 5, 6]) }
    ],
    services: [
      { title: "\u041C\u0443\u0436\u0441\u043A\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430", price: 1200, duration_min: 45 },
      { title: "\u0421\u0442\u0440\u0438\u0436\u043A\u0430 \u043C\u0430\u0448\u0438\u043D\u043A\u043E\u0439", price: 700, duration_min: 30 },
      { title: "\u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 \u0431\u043E\u0440\u043E\u0434\u044B", price: 800, duration_min: 30 },
      { title: "\u0421\u0442\u0440\u0438\u0436\u043A\u0430 + \u0431\u043E\u0440\u043E\u0434\u0430", price: 1800, duration_min: 75 },
      { title: "\u0414\u0435\u0442\u0441\u043A\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430", price: 900, duration_min: 30 }
    ]
  },
  {
    id: "tutor",
    title: "\u0420\u0435\u043F\u0435\u0442\u0438\u0442\u043E\u0440 / \u043F\u0441\u0438\u0445\u043E\u043B\u043E\u0433 / \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u043D\u0442",
    emoji: "\u{1F393}",
    pitch: "\u0417\u0430\u043D\u044F\u0442\u0438\u044F \u0438 \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u0446\u0438\u0438 \u043E\u043D\u043B\u0430\u0439\u043D \u0438\u043B\u0438 \u043E\u0447\u043D\u043E, \u0430\u043D\u043A\u0435\u0442\u0430 \u0441 \u0446\u0435\u043B\u044C\u044E.",
    settings: baseSettings({
      emoji: "\u{1F393}",
      accent: "#4f46e5",
      description: "\u0418\u043D\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u043E\u043D\u043B\u0430\u0439\u043D \u0438 \u043E\u0447\u043D\u043E. \u041F\u0435\u0440\u0432\u043E\u0435 \u043F\u0440\u043E\u0431\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435 \u2014 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E.",
      welcome: "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u0438 \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F. \u0421\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0441\u043E\u0437\u0432\u043E\u043D \u043F\u0440\u0438\u0448\u043B\u044E \u043F\u0435\u0440\u0435\u0434 \u043D\u0430\u0447\u0430\u043B\u043E\u043C.",
      afterBookingText: "\u0417\u0430\u043D\u044F\u0442\u0438\u0435 \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u043E\u043D\u043B\u0430\u0439\u043D. \u0421\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u0441\u043E\u0437\u0432\u043E\u043D \u043F\u0440\u0438\u0448\u043B\u044E \u0432 \u044D\u0442\u043E\u0442 \u0447\u0430\u0442 \u043F\u0435\u0440\u0435\u0434 \u043D\u0430\u0447\u0430\u043B\u043E\u043C.",
      labels: { staff: "\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C", staffPlural: "\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u0438", service: "\u0417\u0430\u043D\u044F\u0442\u0438\u0435" },
      stepMin: 60,
      minLeadMin: 180,
      cancelHours: 12,
      fields: [
        { key: "goal", label: "\u041A\u043B\u0430\u0441\u0441 / \u0446\u0435\u043B\u044C \u0437\u0430\u043D\u044F\u0442\u0438\u0439", placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: 9 \u043A\u043B\u0430\u0441\u0441, \u041E\u0413\u042D \u043F\u043E \u043C\u0430\u0442\u0435\u043C\u0430\u0442\u0438\u043A\u0435", required: true }
      ]
    }),
    staff: [{ name: "\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C", work_hours: weekdays("15:00", "21:00") }],
    services: [
      { title: "\u041F\u0440\u043E\u0431\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435", price: 0, duration_min: 30 },
      { title: "\u0418\u043D\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435", price: 1500, duration_min: 60 },
      { title: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043A \u044D\u043A\u0437\u0430\u043C\u0435\u043D\u0443", price: 2e3, duration_min: 90 },
      { title: "\u041F\u0430\u043A\u0435\u0442 4 \u0437\u0430\u043D\u044F\u0442\u0438\u044F", price: 5400, duration_min: 60, description: "\u041E\u043F\u043B\u0430\u0442\u0430 \u0437\u0430 \u043C\u0435\u0441\u044F\u0446 \u0432\u043F\u0435\u0440\u0451\u0434" }
    ]
  },
  {
    id: "wellness",
    title: "\u041C\u0430\u0441\u0441\u0430\u0436 / \u0442\u0440\u0435\u043D\u0435\u0440 / SPA",
    emoji: "\u{1F9D8}",
    pitch: "\u0421\u0435\u0430\u043D\u0441\u044B 60/90 \u043C\u0438\u043D\u0443\u0442, \u043F\u043E\u0436\u0435\u043B\u0430\u043D\u0438\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430, \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F.",
    settings: baseSettings({
      emoji: "\u{1F9D8}",
      accent: "#0f9d76",
      description: "\u041C\u0430\u0441\u0441\u0430\u0436 \u0438 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0438. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0435\u0430\u043D\u0441 \u0438 \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F.",
      welcome: "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0417\u0430\u043F\u0438\u0448\u0438\u0442\u0435\u0441\u044C \u043D\u0430 \u0441\u0435\u0430\u043D\u0441 \u0432 \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u2014 \u043D\u0430\u043F\u043E\u043C\u043D\u044E \u043D\u0430\u043A\u0430\u043D\u0443\u043D\u0435.",
      labels: { staff: "\u0421\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442", staffPlural: "\u0421\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u044B", service: "\u0421\u0435\u0430\u043D\u0441" },
      cancelHours: 6,
      fields: [{ key: "wish", label: "\u041F\u043E\u0436\u0435\u043B\u0430\u043D\u0438\u044F \u0438\u043B\u0438 \u0437\u043E\u043D\u044B \u0432\u043D\u0438\u043C\u0430\u043D\u0438\u044F", placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0448\u0435\u044F \u0438 \u043F\u043B\u0435\u0447\u0438", required: false }]
    }),
    staff: [{ name: "\u0421\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442", work_hours: weekdays("09:00", "21:00", [1, 2, 3, 4, 5, 6]) }],
    services: [
      { title: "\u041A\u043B\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043C\u0430\u0441\u0441\u0430\u0436", price: 2500, duration_min: 60 },
      { title: "\u041C\u0430\u0441\u0441\u0430\u0436 \u0441\u043F\u0438\u043D\u044B \u0438 \u0448\u0435\u0438", price: 1500, duration_min: 30 },
      { title: "\u0410\u043D\u0442\u0438\u0446\u0435\u043B\u043B\u044E\u043B\u0438\u0442\u043D\u044B\u0439 \u043C\u0430\u0441\u0441\u0430\u0436", price: 2800, duration_min: 60 },
      { title: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0430", price: 2e3, duration_min: 60 },
      { title: "SPA-\u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430", price: 4500, duration_min: 90 }
    ]
  },
  {
    id: "auto",
    title: "\u0410\u0432\u0442\u043E: \u0434\u0435\u0442\u0435\u0439\u043B\u0438\u043D\u0433 / \u0448\u0438\u043D\u043E\u043C\u043E\u043D\u0442\u0430\u0436 / \u0441\u0435\u0440\u0432\u0438\u0441",
    emoji: "\u{1F697}",
    pitch: "\u0414\u043B\u0438\u043D\u043D\u044B\u0435 \u0440\u0430\u0431\u043E\u0442\u044B, \u0434\u0430\u043D\u043D\u044B\u0435 \u0430\u0432\u0442\u043E \u0432 \u0430\u043D\u043A\u0435\u0442\u0435, \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0431\u043E\u043A\u0441\u043E\u0432.",
    settings: baseSettings({
      emoji: "\u{1F697}",
      accent: "#e8590c",
      description: "\u0428\u0438\u043D\u043E\u043C\u043E\u043D\u0442\u0430\u0436, \u043C\u043E\u0439\u043A\u0430, \u0434\u0435\u0442\u0435\u0439\u043B\u0438\u043D\u0433 \u0438 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435. \u0417\u0430\u043F\u0438\u0441\u044C \u0431\u0435\u0437 \u043E\u0447\u0435\u0440\u0435\u0434\u0438 \u0438 \u0437\u0432\u043E\u043D\u043A\u043E\u0432.",
      welcome: "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0417\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0430\u0432\u0442\u043E \u043D\u0430 \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u2014 \u0431\u0435\u0437 \u043E\u0447\u0435\u0440\u0435\u0434\u0438 \u0438 \u0437\u0432\u043E\u043D\u043A\u043E\u0432.",
      labels: { staff: "\u0411\u043E\u043A\u0441", staffPlural: "\u0411\u043E\u043A\u0441\u044B", service: "\u0420\u0430\u0431\u043E\u0442\u0430" },
      stepMin: 30,
      minLeadMin: 60,
      maxDaysAhead: 14,
      cancelHours: 2,
      remind2h: true,
      fields: [
        { key: "car", label: "\u041C\u0430\u0440\u043A\u0430 \u0438 \u043C\u043E\u0434\u0435\u043B\u044C \u0430\u0432\u0442\u043E", placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: Lada Granta", required: true },
        { key: "plate", label: "\u0413\u043E\u0441\u043D\u043E\u043C\u0435\u0440", placeholder: "\u0410123\u0412\u0421 163", required: false }
      ]
    }),
    staff: [{ name: "\u0411\u043E\u043A\u0441 1", work_hours: weekdays("09:00", "20:00", [1, 2, 3, 4, 5, 6, 7]) }],
    services: [
      { title: "\u0428\u0438\u043D\u043E\u043C\u043E\u043D\u0442\u0430\u0436 R13\u2013R16", price: 1600, duration_min: 45 },
      { title: "\u0428\u0438\u043D\u043E\u043C\u043E\u043D\u0442\u0430\u0436 R17\u2013R20", price: 2400, duration_min: 60 },
      { title: "\u041A\u043E\u043C\u043F\u043B\u0435\u043A\u0441\u043D\u0430\u044F \u043C\u043E\u0439\u043A\u0430", price: 900, duration_min: 45 },
      { title: "\u041F\u043E\u043B\u0438\u0440\u043E\u0432\u043A\u0430 \u043A\u0443\u0437\u043E\u0432\u0430", price: 8e3, price_from: true, duration_min: 240 },
      { title: "\u0425\u0438\u043C\u0447\u0438\u0441\u0442\u043A\u0430 \u0441\u0430\u043B\u043E\u043D\u0430", price: 6e3, price_from: true, duration_min: 240 },
      { title: "\u0417\u0430\u043C\u0435\u043D\u0430 \u043C\u0430\u0441\u043B\u0430", price: 700, duration_min: 30 }
    ]
  }
];
var getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
function withDefaults(templateId, settings) {
  const tpl = getTemplate(templateId) ?? TEMPLATES[0];
  return { ...tpl.settings, ...settings ?? {}, labels: { ...tpl.settings.labels, ...settings?.labels ?? {} } };
}

// server/store.ts
var UserError = class extends Error {
};
var rowToBusiness = (r) => ({ ...r, settings: withDefaults(r.template, r.settings) });
async function upsertUser(db2, u) {
  const [row] = await db2.query(
    `insert into users (tg_id, first_name, username) values ($1, $2, $3)
     on conflict (tg_id) do update set first_name = excluded.first_name, username = excluded.username, seen_at = now()
     returning last_business_id`,
    [u.id, u.first_name ?? "", u.username ?? null]
  );
  return row;
}
async function setLastBusiness(db2, tgId, businessId) {
  await db2.query(`update users set last_business_id = $2 where tg_id = $1`, [tgId, businessId]);
}
async function touchClient(db2, businessId, u) {
  await db2.query(
    `insert into clients (business_id, tg_id, name) values ($1, $2, $3)
     on conflict (business_id, tg_id) do update set last_seen = now(), blocked_bot = false`,
    [businessId, u.id, [u.first_name, u.last_name].filter(Boolean).join(" ")]
  );
}
function slugify(name) {
  const map = {
    \u0430: "a",
    \u0431: "b",
    \u0432: "v",
    \u0433: "g",
    \u0434: "d",
    \u0435: "e",
    \u0451: "e",
    \u0436: "zh",
    \u0437: "z",
    \u0438: "i",
    \u0439: "y",
    \u043A: "k",
    \u043B: "l",
    \u043C: "m",
    \u043D: "n",
    \u043E: "o",
    \u043F: "p",
    \u0440: "r",
    \u0441: "s",
    \u0442: "t",
    \u0443: "u",
    \u0444: "f",
    \u0445: "h",
    \u0446: "c",
    \u0447: "ch",
    \u0448: "sh",
    \u0449: "sch",
    \u044A: "",
    \u044B: "y",
    \u044C: "",
    \u044D: "e",
    \u044E: "yu",
    \u044F: "ya"
  };
  const base = name.toLowerCase().split("").map((c) => map[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return base.length >= 3 ? base : `biz-${base || "new"}`;
}
async function createBusinessFromTemplate(db2, opts) {
  const tpl = getTemplate(opts.templateId);
  if (!tpl) throw new UserError("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D");
  const name = opts.name.trim().slice(0, 80);
  if (name.length < 2) throw new UserError("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435");
  return db2.tx(async (tx) => {
    let slug = opts.slug ? slugify(opts.slug) : slugify(name);
    const taken = await tx.query(`select 1 from businesses where slug = $1`, [slug]);
    if (taken.length) {
      if (opts.slug) throw new UserError("\u0422\u0430\u043A\u0430\u044F \u0441\u0441\u044B\u043B\u043A\u0430 \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442\u0430");
      slug = `${slug.slice(0, 28)}-${randomBytes(2).toString("hex")}`;
    }
    const [b] = await tx.query(
      `insert into businesses (slug, name, template, timezone, settings, created_by)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [slug, name, tpl.id, opts.timezone ?? "Europe/Moscow", tpl.settings, opts.createdBy ?? null]
    );
    for (const [i, s] of tpl.staff.entries()) {
      await tx.query(
        `insert into staff (business_id, name, description, work_hours, sort) values ($1, $2, $3, $4, $5)`,
        [b.id, s.name, s.description ?? "", s.work_hours, i]
      );
    }
    for (const [i, s] of tpl.services.entries()) {
      await tx.query(
        `insert into services (business_id, title, description, price, price_from, duration_min, sort)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [b.id, s.title, s.description ?? "", s.price, s.price_from ?? false, s.duration_min, i]
      );
    }
    if (opts.ownerTgId) {
      await tx.query(`insert into business_admins (business_id, tg_id, role) values ($1, $2, 'owner')`, [b.id, opts.ownerTgId]);
    }
    return rowToBusiness(b);
  });
}
async function getBusiness(db2, idOrSlug) {
  const rows = typeof idOrSlug === "number" ? await db2.query(`select * from businesses where id = $1`, [idOrSlug]) : await db2.query(`select * from businesses where slug = $1`, [idOrSlug.toLowerCase()]);
  return rows[0] ? rowToBusiness(rows[0]) : null;
}
async function roleFor(db2, tgId, businessId, superadmins) {
  if (superadmins.includes(tgId)) return "super";
  const [r] = await db2.query(`select role from business_admins where business_id = $1 and tg_id = $2`, [businessId, tgId]);
  return r?.role ?? null;
}
async function businessesOfAdmin(db2, tgId) {
  const rows = await db2.query(
    `select b.*, a.role from business_admins a join businesses b on b.id = a.business_id
     where a.tg_id = $1 order by b.created_at`,
    [tgId]
  );
  return rows.map((r) => ({ ...rowToBusiness(r), role: r.role }));
}
async function updateBusiness(db2, businessId, patch) {
  const b = await getBusiness(db2, businessId);
  if (!b) throw new UserError("\u0411\u0438\u0437\u043D\u0435\u0441 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  if (patch.timezone && !DateTime3.local().setZone(patch.timezone).isValid) throw new UserError("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0447\u0430\u0441\u043E\u0432\u043E\u0439 \u043F\u043E\u044F\u0441");
  const settings = { ...b.settings, ...patch.settings ?? {} };
  if (settings.stepMin < 5 || settings.stepMin > 240) throw new UserError("\u0428\u0430\u0433 \u0441\u0435\u0442\u043A\u0438 \u2014 \u043E\u0442 5 \u0434\u043E 240 \u043C\u0438\u043D\u0443\u0442");
  const [row] = await db2.query(
    `update businesses set name = $2, timezone = $3, settings = $4 where id = $1 returning *`,
    [businessId, (patch.name ?? b.name).trim().slice(0, 80), patch.timezone ?? b.timezone, settings]
  );
  return rowToBusiness(row);
}
async function createInvite(db2, businessId, role, createdBy) {
  const code = randomBytes(9).toString("base64url");
  await db2.query(`insert into invites (code, business_id, role, created_by) values ($1, $2, $3, $4)`, [
    code,
    businessId,
    role,
    createdBy
  ]);
  return code;
}
async function claimInvite(db2, code, tgId) {
  return db2.tx(async (tx) => {
    const [inv] = await tx.query(`select * from invites where code = $1 for update`, [code]);
    if (!inv) throw new UserError("\u041F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E");
    if (inv.used_by && inv.used_by !== tgId) throw new UserError("\u041F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u043E");
    if (new Date(inv.expires_at) < /* @__PURE__ */ new Date()) throw new UserError("\u0421\u0440\u043E\u043A \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F \u0438\u0441\u0442\u0451\u043A");
    await tx.query(`update invites set used_by = $2, used_at = now() where code = $1`, [code, tgId]);
    await tx.query(
      `insert into business_admins (business_id, tg_id, role) values ($1, $2, $3)
       on conflict (business_id, tg_id) do update set role = case when business_admins.role = 'owner' then 'owner' else excluded.role end`,
      [inv.business_id, tgId, inv.role]
    );
    const [b] = await tx.query(`select * from businesses where id = $1`, [inv.business_id]);
    return { business: rowToBusiness(b), role: inv.role };
  });
}
var listServices = (db2, businessId, all = false) => db2.query(
  `select * from services where business_id = $1 ${all ? "" : "and active"} order by sort, id`,
  [businessId]
);
var listStaff = (db2, businessId, all = false) => db2.query(`select * from staff where business_id = $1 ${all ? "" : "and active"} order by sort, id`, [businessId]);
var listPortfolio = (db2, businessId) => db2.query(
  `select id, file_id, caption from portfolio where business_id = $1 order by sort, id desc limit 60`,
  [businessId]
);
async function busyFor(db2, businessId, staffIds, from, to) {
  const bookings = await db2.query(
    `select staff_id, starts_at, ends_at from bookings
     where business_id = $1 and status = 'confirmed' and starts_at < $3 and ends_at > $2`,
    [businessId, from, to]
  );
  const off = await db2.query(
    `select staff_id, starts_at, ends_at from time_off where business_id = $1 and starts_at < $3 and ends_at > $2`,
    [businessId, from, to]
  );
  const map = new Map(staffIds.map((id) => [id, []]));
  for (const b of bookings) map.get(b.staff_id)?.push({ start: b.starts_at, end: b.ends_at });
  for (const o of off) {
    for (const id of staffIds) {
      if (o.staff_id === null || o.staff_id === id) map.get(id).push({ start: o.starts_at, end: o.ends_at });
    }
  }
  return map;
}
async function availability(db2, opts) {
  const { business } = opts;
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const [service] = await db2.query(`select * from services where id = $1 and business_id = $2 and active`, [
    opts.serviceId,
    business.id
  ]);
  if (!service) throw new UserError("\u0423\u0441\u043B\u0443\u0433\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
  let staff = await listStaff(db2, business.id);
  if (opts.staffId) staff = staff.filter((s2) => s2.id === opts.staffId);
  if (!staff.length) return {};
  const s = business.settings;
  const days = Math.min(opts.days, s.maxDaysAhead + 1);
  const dates = upcomingDates(now, business.timezone, days);
  const from = dayBoundsUtc(dates[0], business.timezone).from;
  const to = dayBoundsUtc(dates[dates.length - 1], business.timezone).to;
  const busy = await busyFor(db2, business.id, staff.map((x) => x.id), from, to);
  const result = {};
  for (const date of dates) {
    const byStart = /* @__PURE__ */ new Map();
    for (const st of staff) {
      const slots = computeSlots({
        date,
        tz: business.timezone,
        workHours: st.work_hours,
        stepMin: s.stepMin,
        durationMin: service.duration_min,
        busy: busy.get(st.id) ?? [],
        now,
        minLeadMin: s.minLeadMin,
        maxDaysAhead: s.maxDaysAhead
      });
      for (const slot of slots) {
        const ex = byStart.get(slot.start);
        if (ex) ex.staffIds.push(st.id);
        else byStart.set(slot.start, { ...slot, staffIds: [st.id] });
      }
    }
    const list = [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
    if (list.length) result[date] = list;
  }
  return result;
}
var BookingConflict = class extends UserError {
  constructor() {
    super("\u042D\u0442\u043E \u0432\u0440\u0435\u043C\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E \u0437\u0430\u043D\u044F\u043B\u0438. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0435, \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430.");
  }
};
async function createBooking(db2, opts) {
  const { business, client } = opts;
  if (business.status !== "active") throw new UserError("\u0417\u0430\u043F\u0438\u0441\u044C \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
  const s = business.settings;
  const name = client.name.trim().slice(0, 80);
  if (name.length < 2) throw new UserError("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0438\u043C\u044F");
  const phone = client.phone.trim();
  if (s.requirePhone && !phone) throw new UserError("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0442\u0435\u043B\u0435\u0444\u043E\u043D");
  const answers = {};
  for (const f of s.fields) {
    const v = (opts.answers?.[f.key] ?? "").trim().slice(0, 300);
    if (f.required && !v) throw new UserError(`\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043F\u043E\u043B\u0435 \xAB${f.label}\xBB`);
    if (v) answers[f.key] = v;
  }
  const date = DateTime3.fromISO(opts.start).setZone(business.timezone).toISODate();
  const avail = await availability(db2, {
    business,
    serviceId: opts.serviceId,
    staffId: opts.staffId,
    days: s.maxDaysAhead + 1,
    now: opts.now
  });
  const startIso = new Date(opts.start).toISOString();
  const slot = (avail[date] ?? []).find((x) => x.start === startIso);
  if (!slot) throw new BookingConflict();
  const [service] = await listServices(db2, business.id).then((l) => l.filter((x) => x.id === opts.serviceId));
  for (const staffId of slot.staffIds) {
    try {
      const [row] = await db2.query(
        `insert into bookings (business_id, staff_id, service_id, service_title, price, client_tg_id, client_name,
           client_phone, answers, comment, starts_at, ends_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [
          business.id,
          staffId,
          service.id,
          service.title,
          service.price,
          client.tgId,
          name,
          phone,
          answers,
          (opts.comment ?? "").trim().slice(0, 500),
          slot.start,
          slot.end
        ]
      );
      await db2.query(
        `insert into clients (business_id, tg_id, name, phone) values ($1, $2, $3, $4)
         on conflict (business_id, tg_id) do update set name = excluded.name, phone = excluded.phone, last_seen = now()`,
        [business.id, client.tgId, name, phone]
      );
      return row;
    } catch (e) {
      if (isOverlapError(e)) continue;
      throw e;
    }
  }
  throw new BookingConflict();
}
async function getBookingById(db2, id) {
  const [r] = await db2.query(`select * from bookings where id = $1`, [id]);
  return r ?? null;
}
async function cancelBooking(db2, opts) {
  const b = await getBookingById(db2, opts.bookingId);
  if (!b || b.business_id !== opts.business.id) throw new UserError("\u0417\u0430\u043F\u0438\u0441\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
  if (b.status !== "confirmed") throw new UserError("\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0436\u0435 \u043D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u0430");
  if (opts.by === "client") {
    if (b.client_tg_id !== opts.tgId) throw new UserError("\u042D\u0442\u043E \u043D\u0435 \u0432\u0430\u0448\u0430 \u0437\u0430\u043F\u0438\u0441\u044C");
    const hoursLeft = (new Date(b.starts_at).getTime() - (opts.now ?? /* @__PURE__ */ new Date()).getTime()) / 36e5;
    if (hoursLeft < opts.business.settings.cancelHours) {
      throw new UserError(`\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u043D\u043B\u0430\u0439\u043D \u043C\u043E\u0436\u043D\u043E \u043D\u0435 \u043F\u043E\u0437\u0436\u0435 \u0447\u0435\u043C \u0437\u0430 ${opts.business.settings.cancelHours} \u0447. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043C\u0430\u0441\u0442\u0435\u0440\u0443.`);
    }
  }
  const [row] = await db2.query(
    `update bookings set status = 'cancelled', cancelled_by = $2 where id = $1 returning *`,
    [b.id, opts.by]
  );
  return row;
}
var clientBookings = (db2, businessId, tgId) => db2.query(
  `select * from bookings where business_id = $1 and client_tg_id = $2
     and (starts_at > now() - interval '30 days') order by starts_at desc limit 30`,
  [businessId, tgId]
);
var bookingsInRange = (db2, businessId, from, to) => db2.query(
  `select b.*, s.name as staff_name from bookings b join staff s on s.id = b.staff_id
     where b.business_id = $1 and b.starts_at >= $2 and b.starts_at < $3 order by b.starts_at`,
  [businessId, from, to]
);
async function setBookingStatus(db2, businessId, id, status2) {
  const [row] = await db2.query(
    `update bookings set status = $3 where id = $1 and business_id = $2 and status <> 'cancelled' returning *`,
    [id, businessId, status2]
  );
  if (!row) throw new UserError("\u0417\u0430\u043F\u0438\u0441\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
  return row;
}
async function businessStats(db2, businessId) {
  const [r] = await db2.query(
    `select
       (select count(*) from clients where business_id = $1)::int as clients,
       (select count(*) from bookings where business_id = $1 and status in ('confirmed','done'))::int as bookings,
       (select count(*) from bookings where business_id = $1 and status = 'confirmed' and starts_at > now())::int as upcoming,
       (select count(*) from bookings where business_id = $1 and status = 'cancelled')::int as cancelled,
       (select coalesce(sum(price),0) from bookings where business_id = $1 and status = 'done'
          and starts_at > now() - interval '30 days')::int as revenue_30d`,
    [businessId]
  );
  return r;
}
async function allBusinesses(db2) {
  return db2.query(
    `select b.id, b.slug, b.name, b.template, b.status, b.created_at,
       (select count(*) from clients c where c.business_id = b.id)::int as clients,
       (select count(*) from bookings k where k.business_id = b.id and k.status in ('confirmed','done'))::int as bookings,
       (select count(*) from business_admins a where a.business_id = b.id and a.role = 'owner')::int as owners
     from businesses b order by b.created_at desc`
  );
}
async function platformStats(db2) {
  const [r] = await db2.query(
    `select (select count(*) from businesses)::int as businesses,
            (select count(*) from users)::int as users,
            (select count(*) from bookings)::int as bookings,
            (select count(*) from users where seen_at > now() - interval '30 days')::int as active_30d`
  );
  return r;
}

// server/bot.ts
var bot = null;
function getBot() {
  if (bot) return bot;
  const botInfo = {
    id: Number(config.botToken.split(":")[0]),
    is_bot: true,
    first_name: config.botUsername,
    username: config.botUsername,
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: Boolean(config.botAppName)
  };
  bot = new Bot(config.botToken, { botInfo });
  register(bot);
  return bot;
}
var isSuper = (id) => config.superadmins.includes(id);
async function showBusiness(ctx, b) {
  const s = b.settings;
  const kb = new InlineKeyboard().webApp(`\u{1F4C5} \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043E\u043D\u043B\u0430\u0439\u043D`, webAppUrl({ b: b.slug })).row().webApp("\u{1F5C2} \u041C\u043E\u0438 \u0437\u0430\u043F\u0438\u0441\u0438", webAppUrl({ b: b.slug, view: "my" }));
  const lines = [`${esc(s.emoji)} <b>${esc(b.name)}</b>`, "", esc(s.welcome)];
  if (s.address) lines.push("", `\u{1F4CD} ${esc(s.address)}`);
  if (s.contactPhone) lines.push(`\u{1F4DE} ${esc(s.contactPhone)}`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
  await ctx.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: { type: "web_app", text: "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F", web_app: { url: webAppUrl({ b: b.slug }) } } }).catch(() => {
  });
}
async function showPlatform(ctx) {
  const uid = ctx.from.id;
  const adminOf = await businessesOfAdmin(db(), uid);
  const kb = new InlineKeyboard();
  for (const b of adminOf.slice(0, 5)) kb.webApp(`\u2699\uFE0F ${b.name}`, webAppUrl({ b: b.slug, view: "admin" })).row();
  if (isSuper(uid)) kb.webApp("\u{1F451} \u041F\u0430\u043D\u0435\u043B\u044C \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B", webAppUrl({ view: "super" })).row();
  kb.webApp("\u{1F680} \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0441\u0432\u043E\u0439 \u0431\u0438\u0437\u043D\u0435\u0441", webAppUrl({ view: "onboard" }));
  const text = adminOf.length ? "\u0412\u0430\u0448\u0438 \u0431\u0438\u0437\u043D\u0435\u0441\u044B \u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F:" : [
    "\u{1F44B} <b>\u041E\u043D\u043B\u0430\u0439\u043D-\u0437\u0430\u043F\u0438\u0441\u044C \u0434\u043B\u044F \u043C\u0430\u043B\u043E\u0433\u043E \u0431\u0438\u0437\u043D\u0435\u0441\u0430 \u2014 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E</b>",
    "",
    "\u0415\u0441\u043B\u0438 \u0432\u044B \u043A\u043B\u0438\u0435\u043D\u0442 \u2014 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443 \u0432\u0430\u0448\u0435\u0433\u043E \u043C\u0430\u0441\u0442\u0435\u0440\u0430, \u0438 \u0437\u0434\u0435\u0441\u044C \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u043A \u043D\u0435\u043C\u0443.",
    "",
    "\u0415\u0441\u043B\u0438 \u0432\u044B \u043C\u0430\u0441\u0442\u0435\u0440 \u0438\u043B\u0438 \u043F\u0440\u0435\u0434\u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0442\u0435\u043B\u044C \u2014 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0441\u0432\u043E\u0439 \u0431\u0438\u0437\u043D\u0435\u0441 \u0437\u0430 \u043C\u0438\u043D\u0443\u0442\u0443: \u0443\u0441\u043B\u0443\u0433\u0438, \u0433\u0440\u0430\u0444\u0438\u043A, \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430\u043C, \u0440\u0430\u0441\u0441\u044B\u043B\u043A\u0438."
  ].join("\n");
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}
function register(b) {
  b.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) await upsertUser(db(), ctx.from);
    await next();
  });
  b.command("start", async (ctx) => {
    const payload = (ctx.match ?? "").trim();
    const uid = ctx.from.id;
    if (payload.startsWith("inv_")) {
      try {
        const { business, role } = await claimInvite(db(), payload.slice(4), uid);
        await setLastBusiness(db(), uid, business.id);
        const kb = new InlineKeyboard().webApp("\u2699\uFE0F \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F", webAppUrl({ b: business.slug, view: "admin" }));
        await ctx.reply(
          [
            `\u{1F389} <b>\u0413\u043E\u0442\u043E\u0432\u043E!</b> \u0412\u044B ${role === "owner" ? "\u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446" : "\u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440"} \xAB${esc(business.name)}\xBB.`,
            "",
            "\u0412 \u043F\u0430\u043D\u0435\u043B\u0438 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u043C\u0435\u043D\u044F\u0442\u044C \u0443\u0441\u043B\u0443\u0433\u0438, \u0446\u0435\u043D\u044B, \u0433\u0440\u0430\u0444\u0438\u043A \u0438 \u0442\u0435\u043A\u0441\u0442\u044B. \u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043B\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u2014 \u0435\u0451 \u043C\u043E\u0436\u043D\u043E \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0432 \u0448\u0430\u043F\u043A\u0443 \u043A\u0430\u043D\u0430\u043B\u0430, Instagram \u0438 \u0432 \u043E\u0442\u0432\u0435\u0442\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u0430\u043C:",
            esc(clientLink(business.slug))
          ].join("\n"),
          { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } }
        );
        if (role === "owner") {
          const { notifySuperadmins: notifySuperadmins2 } = await Promise.resolve().then(() => (init_notify(), notify_exports));
          await notifySuperadmins2(
            `\u2705 \u041F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043D\u044F\u0442\u043E: \xAB${esc(business.name)}\xBB \u2192 <a href="tg://user?id=${uid}">${esc(ctx.from.first_name)}</a>`
          );
        }
      } catch (e) {
        await ctx.reply(e instanceof UserError ? `\u26A0\uFE0F ${e.message}` : "\u26A0\uFE0F \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u0438\u043D\u044F\u0442\u044C \u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435");
      }
      return;
    }
    if (payload) {
      const business = await getBusiness(db(), payload);
      if (business && business.status === "active") {
        await setLastBusiness(db(), uid, business.id);
        const role = await roleFor(db(), uid, business.id, config.superadmins);
        if (!role) await touchClient(db(), business.id, ctx.from);
        return showBusiness(ctx, business);
      }
      if (business) return ctx.reply("\u0417\u0430\u043F\u0438\u0441\u044C \u0432 \u044D\u0442\u043E\u0442 \u0431\u0438\u0437\u043D\u0435\u0441 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430.");
    }
    const [u] = await db().query(`select last_business_id from users where tg_id = $1`, [uid]);
    if (u?.last_business_id && !payload) {
      const business = await getBusiness(db(), Number(u.last_business_id));
      if (business?.status === "active") return showBusiness(ctx, business);
    }
    return showPlatform(ctx);
  });
  b.command("admin", (ctx) => showPlatform(ctx));
  b.command(
    "help",
    (ctx) => ctx.reply(
      "\u0417\u0430\u043F\u0438\u0441\u044C, \u043E\u0442\u043C\u0435\u043D\u0430 \u0438 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u2014 \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438 (\u043A\u043D\u043E\u043F\u043A\u0430 \xAB\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F\xBB \u0432\u043D\u0438\u0437\u0443).\n/start \u2014 \u0433\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E\n/admin \u2014 \u043F\u0430\u043D\u0435\u043B\u044C \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0435\u0432 \u0431\u0438\u0437\u043D\u0435\u0441\u0430"
    )
  );
  b.on("message", async (ctx) => {
    const [u] = await db().query(`select last_business_id from users where tg_id = $1`, [ctx.from.id]);
    const business = u?.last_business_id ? await getBusiness(db(), Number(u.last_business_id)) : null;
    if (!business) return showPlatform(ctx);
    const s = business.settings;
    const contacts = [s.contactPhone && `\u{1F4DE} ${esc(s.contactPhone)}`, ...s.links.map((l) => `\u{1F517} <a href="${esc(l.url)}">${esc(l.title)}</a>`)].filter(Boolean).join("\n");
    await ctx.reply(
      `\u042F \u0431\u043E\u0442 \u043E\u043D\u043B\u0430\u0439\u043D-\u0437\u0430\u043F\u0438\u0441\u0438 \xAB${esc(business.name)}\xBB \u0438 \u043D\u0435 \u0447\u0438\u0442\u0430\u044E \u043F\u0435\u0440\u0435\u043F\u0438\u0441\u043A\u0443 \u{1F642}${contacts ? `
\u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E:
${contacts}` : ""}`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("\u{1F4C5} \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F", webAppUrl({ b: business.slug })),
        link_preview_options: { is_disabled: true }
      }
    );
  });
  b.on("my_chat_member", async (ctx) => {
    if (ctx.myChatMember.new_chat_member.status === "kicked") {
      await db().query(`update clients set blocked_bot = true where tg_id = $1`, [ctx.from.id]);
    }
  });
  b.catch((err) => console.error("bot error", err.error));
}

// server/handler.ts
init_config();

// server/cron.ts
import { DateTime as DateTime4 } from "luxon";
init_notify();
async function runReminders(now = /* @__PURE__ */ new Date()) {
  const rows = await db().query(
    `select b.*, z.timezone as tz from bookings b join businesses z on z.id = b.business_id
     where b.status = 'confirmed' and z.status = 'active'
       and b.starts_at > $1 and b.starts_at < $1::timestamptz + interval '48 hours'
       and (not b.reminded_24h or not b.reminded_2h)
     order by b.starts_at limit 1000`,
    [now.toISOString()]
  );
  const cache = /* @__PURE__ */ new Map();
  let sent = 0;
  for (const b of rows) {
    if (!cache.has(b.business_id)) cache.set(b.business_id, await getBusiness(db(), b.business_id));
    const biz = cache.get(b.business_id);
    if (!biz) continue;
    const msLeft = new Date(b.starts_at).getTime() - now.getTime();
    const tomorrow = DateTime4.fromJSDate(now).setZone(biz.timezone).plus({ days: 1 }).toISODate();
    const isTomorrow = DateTime4.fromJSDate(new Date(b.starts_at)).setZone(biz.timezone).toISODate() === tomorrow;
    const createdRecently = now.getTime() - new Date(b.created_at).getTime() < 30 * 6e4;
    if (!b.reminded_2h && biz.settings.remind2h && msLeft <= 2 * 36e5) {
      if (!createdRecently) {
        await sendReminder(biz, b, "2h", now);
        sent++;
      }
      await db().query(`update bookings set reminded_2h = true, reminded_24h = true where id = $1`, [b.id]);
    } else if (!b.reminded_24h && (msLeft <= 24 * 36e5 || isTomorrow)) {
      if (!createdRecently) {
        await sendReminder(biz, b, "24h", now);
        sent++;
      }
      await db().query(`update bookings set reminded_24h = true where id = $1`, [b.id]);
    }
  }
  await db().query(
    `update bookings set status = 'done' where status = 'confirmed' and ends_at < $1::timestamptz - interval '12 hours'`,
    [now.toISOString()]
  );
  return { checked: rows.length, sent };
}

// server/rpc.ts
init_config();
import { DateTime as DateTime5 } from "luxon";
init_format();
init_notify();
init_telegram();
var int = (v, name) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new UserError(`\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043F\u043E\u043B\u0435 ${name}`);
  return n;
};
var str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
function publicBusiness(b) {
  return { id: b.id, slug: b.slug, name: b.name, template: b.template, status: b.status, timezone: b.timezone, settings: b.settings };
}
function links(b) {
  return { client: clientLink(b.slug), botStart: `https://t.me/${config.botUsername}?start=${b.slug}` };
}
async function catalog(b) {
  const [services, staff, portfolio] = await Promise.all([
    listServices(db(), b.id),
    listStaff(db(), b.id),
    listPortfolio(db(), b.id)
  ]);
  return {
    services: services.map(({ id, title, description, price, price_from, duration_min }) => ({
      id,
      title,
      description,
      price,
      price_from,
      duration_min
    })),
    staff: staff.map(({ id, name, description }) => ({ id, name, description })),
    portfolio: portfolio.map((p) => ({ id: p.id, caption: p.caption }))
  };
}
async function boot(ctx, p) {
  const u = ctx.init.user;
  const me = await upsertUser(db(), u);
  const isSuper2 = config.superadmins.includes(u.id);
  const wanted = str(p.slug, 60) || ctx.init.startParam || void 0;
  let business = null;
  if (p.businessId) business = await getBusiness(db(), int(p.businessId, "businessId"));
  if (!business && wanted && !wanted.startsWith("inv_")) business = await getBusiness(db(), wanted);
  if (!business && me.last_business_id) business = await getBusiness(db(), Number(me.last_business_id));
  const adminOf = await businessesOfAdmin(db(), u.id);
  const role = business ? await roleFor(db(), u.id, business.id, config.superadmins) : null;
  if (business && business.status === "blocked" && !role) {
    return { me: { id: u.id, name: u.first_name, isSuper: isSuper2 }, business: null, blocked: true, adminOf: [], templates: tplList() };
  }
  if (business) {
    if (Number(me.last_business_id) !== business.id) {
      await setLastBusiness(db(), u.id, business.id);
      tg().setChatMenuButton(u.id, "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F", webAppUrl({ b: business.slug })).catch(() => {
      });
    }
    if (!role) await touchClient(db(), business.id, u);
  }
  const [client] = business ? await db().query(`select name, phone from clients where business_id = $1 and tg_id = $2`, [business.id, u.id]) : [];
  return {
    me: { id: u.id, name: u.first_name, isSuper: isSuper2 },
    business: business ? { ...publicBusiness(business), ...await catalog(business) } : null,
    role,
    client: client ?? null,
    adminOf: adminOf.map((b) => ({ id: b.id, slug: b.slug, name: b.name, role: b.role, emoji: b.settings.emoji })),
    templates: tplList()
  };
}
var tplList = () => TEMPLATES.map(({ id, title, emoji, pitch }) => ({ id, title, emoji, pitch }));
async function requireBusiness(id) {
  const b = await getBusiness(db(), int(id, "businessId"));
  if (!b) throw new UserError("\u0411\u0438\u0437\u043D\u0435\u0441 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  return b;
}
async function availability2(ctx, p) {
  const b = await requireBusiness(p.businessId);
  return availability(db(), {
    business: b,
    serviceId: int(p.serviceId, "serviceId"),
    staffId: p.staffId ? int(p.staffId, "staffId") : null,
    days: Math.min(int(p.days ?? 14, "days"), 62),
    now: ctx.now
  });
}
async function book(ctx, p) {
  const b = await requireBusiness(p.businessId);
  const booking = await createBooking(db(), {
    business: b,
    serviceId: int(p.serviceId, "serviceId"),
    staffId: p.staffId ? int(p.staffId, "staffId") : null,
    start: str(p.start, 40),
    client: { tgId: ctx.init.user.id, name: str(p.name, 80), phone: str(p.phone, 30) },
    answers: typeof p.answers === "object" && p.answers ? p.answers : {},
    comment: str(p.comment),
    now: ctx.now
  });
  await onBookingCreated(db(), b, booking);
  return { id: booking.id, starts_at: booking.starts_at };
}
async function myBookings(ctx, p) {
  const b = await requireBusiness(p.businessId);
  const rows = await clientBookings(db(), b.id, ctx.init.user.id);
  return rows.map(({ id, service_title, price, starts_at, ends_at, status: status2, cancelled_by }) => ({
    id,
    service_title,
    price,
    starts_at,
    ends_at,
    status: status2,
    cancelled_by
  }));
}
async function cancelMy(ctx, p) {
  const b = await requireBusiness(p.businessId);
  const res = await cancelBooking(db(), {
    bookingId: int(p.bookingId, "bookingId"),
    business: b,
    by: "client",
    tgId: ctx.init.user.id,
    now: ctx.now
  });
  await onBookingCancelled(db(), b, res);
  return { ok: true };
}
async function createOwnBusiness(ctx, p) {
  const u = ctx.init.user;
  const isSuper2 = config.superadmins.includes(u.id);
  const owned = await db().query(`select count(*)::int as n from business_admins where tg_id = $1 and role = 'owner'`, [u.id]);
  if (!isSuper2 && owned[0].n >= 3) throw new UserError("\u041C\u043E\u0436\u043D\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043E 3 \u0431\u0438\u0437\u043D\u0435\u0441\u043E\u0432. \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043D\u0430\u043C, \u0435\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435.");
  const b = await createBusinessFromTemplate(db(), {
    templateId: str(p.templateId, 30),
    name: str(p.name, 80),
    ownerTgId: u.id,
    createdBy: u.id
  });
  await notifySuperadmins(
    `\u{1F195} <b>\u041D\u043E\u0432\u044B\u0439 \u0431\u0438\u0437\u043D\u0435\u0441</b>: ${esc(b.name)} (${esc(b.template)})
\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446: <a href="tg://user?id=${u.id}">${esc(u.first_name)}</a>${u.username ? ` @${esc(u.username)}` : ""}
${esc(clientLink(b.slug))}`
  );
  return { slug: b.slug, links: links(b) };
}
async function adminOverview(ctx) {
  const b = ctx.business;
  const [stats, services, staff, admins] = await Promise.all([
    businessStats(db(), b.id),
    listServices(db(), b.id, true),
    listStaff(db(), b.id, true),
    db().query(
      `select a.tg_id, a.role, u.first_name, u.username from business_admins a left join users u on u.tg_id = a.tg_id
       where a.business_id = $1 order by a.created_at`,
      [b.id]
    )
  ]);
  return { business: publicBusiness(b), role: ctx.role, stats, services, staff, admins, links: links(b) };
}
async function adminBookings(ctx, p) {
  const tz = ctx.business.timezone;
  const date = str(p.date, 10) || DateTime5.now().setZone(tz).toISODate();
  const days = Math.min(Math.max(int(p.days ?? 1, "days"), 1), 31);
  const from = dayBoundsUtc(date, tz).from;
  const to = DateTime5.fromISO(from).plus({ days }).toUTC().toISO();
  return bookingsInRange(db(), ctx.business.id, from, to);
}
async function adminCancelBooking(ctx, p) {
  const res = await cancelBooking(db(), {
    bookingId: int(p.bookingId, "bookingId"),
    business: ctx.business,
    by: "admin",
    tgId: ctx.init.user.id
  });
  await onBookingCancelled(db(), ctx.business, res);
  return { ok: true };
}
async function adminSetStatus(ctx, p) {
  const status2 = str(p.status, 20);
  if (!["done", "no_show", "confirmed"].includes(status2)) throw new UserError("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441");
  await setBookingStatus(db(), ctx.business.id, int(p.bookingId, "bookingId"), status2);
  return { ok: true };
}
async function saveService(ctx, p) {
  const s = p.service ?? {};
  const title = str(s.title, 100);
  if (title.length < 2) throw new UserError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0443\u0441\u043B\u0443\u0433\u0438");
  const price = Math.max(0, Math.min(int(s.price ?? 0, "price"), 1e7));
  const duration = int(s.duration_min ?? 60, "duration_min");
  if (duration < 5 || duration > 720) throw new UserError("\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u2014 \u043E\u0442 5 \u0434\u043E 720 \u043C\u0438\u043D\u0443\u0442");
  const vals = [title, str(s.description), price, Boolean(s.price_from), duration, s.active !== false, int(s.sort ?? 0, "sort")];
  if (s.id) {
    const rows = await db().query(
      `update services set title=$3, description=$4, price=$5, price_from=$6, duration_min=$7, active=$8, sort=$9
       where id = $1 and business_id = $2 returning *`,
      [int(s.id, "id"), ctx.business.id, ...vals]
    );
    if (!rows.length) throw new UserError("\u0423\u0441\u043B\u0443\u0433\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    return rows[0];
  }
  const [row] = await db().query(
    `insert into services (business_id, title, description, price, price_from, duration_min, active, sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [ctx.business.id, ...vals]
  );
  return row;
}
async function deleteService(ctx, p) {
  await db().query(`delete from services where id = $1 and business_id = $2`, [int(p.id, "id"), ctx.business.id]);
  return { ok: true };
}
var HM = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateWorkHours(wh) {
  const out = {};
  if (!wh || typeof wh !== "object") return out;
  for (const [day, intervals] of Object.entries(wh)) {
    if (!/^[1-7]$/.test(day) || !Array.isArray(intervals)) continue;
    const list = [];
    for (const it of intervals) {
      if (!Array.isArray(it) || !HM.test(it[0]) || !(HM.test(it[1]) || it[1] === "24:00")) {
        throw new UserError("\u0412\u0440\u0435\u043C\u044F \u0440\u0430\u0431\u043E\u0442\u044B \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 \u0427\u0427:\u041C\u041C");
      }
      if (it[0] >= it[1]) throw new UserError("\u041D\u0430\u0447\u0430\u043B\u043E \u0441\u043C\u0435\u043D\u044B \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0440\u0430\u043D\u044C\u0448\u0435 \u043A\u043E\u043D\u0446\u0430");
      list.push([it[0], it[1]]);
    }
    if (list.length) out[day] = list.sort((a, b) => a[0].localeCompare(b[0]));
  }
  return out;
}
async function saveStaff(ctx, p) {
  const s = p.staff ?? {};
  const name = str(s.name, 60);
  if (name.length < 1) throw new UserError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F");
  const wh = validateWorkHours(s.work_hours);
  const tgId = s.tg_id ? int(s.tg_id, "tg_id") : null;
  const vals = [name, str(s.description, 200), tgId, wh, s.active !== false, int(s.sort ?? 0, "sort")];
  if (s.id) {
    const rows = await db().query(
      `update staff set name=$3, description=$4, tg_id=$5, work_hours=$6, active=$7, sort=$8
       where id = $1 and business_id = $2 returning *`,
      [int(s.id, "id"), ctx.business.id, ...vals]
    );
    if (!rows.length) throw new UserError("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E");
    return rows[0];
  }
  const [row] = await db().query(
    `insert into staff (business_id, name, description, tg_id, work_hours, active, sort) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [ctx.business.id, ...vals]
  );
  return row;
}
async function deleteStaff(ctx, p) {
  const id = int(p.id, "id");
  const active = await db().query(`select id from staff where business_id = $1 and active and id <> $2`, [ctx.business.id, id]);
  if (!active.length) throw new UserError("\u041D\u0443\u0436\u0435\u043D \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u043C\u0430\u0441\u0442\u0435\u0440");
  const has = await db().query(`select 1 from bookings where staff_id = $1 limit 1`, [id]);
  if (has.length) {
    const future = await db().query(`select 1 from bookings where staff_id = $1 and status='confirmed' and starts_at > now() limit 1`, [id]);
    if (future.length) throw new UserError("\u0423 \u043C\u0430\u0441\u0442\u0435\u0440\u0430 \u0435\u0441\u0442\u044C \u0431\u0443\u0434\u0443\u0449\u0438\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u2014 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0438\u0442\u0435 \u0438\u043B\u0438 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u0438\u0445");
    await db().query(`update staff set active = false where id = $1 and business_id = $2`, [id, ctx.business.id]);
  } else {
    await db().query(`delete from staff where id = $1 and business_id = $2`, [id, ctx.business.id]);
  }
  return { ok: true };
}
async function listTimeOff(ctx) {
  return db().query(
    `select t.*, s.name as staff_name from time_off t left join staff s on s.id = t.staff_id
     where t.business_id = $1 and t.ends_at > now() order by t.starts_at limit 100`,
    [ctx.business.id]
  );
}
async function addTimeOff(ctx, p) {
  const tz = ctx.business.timezone;
  const dateFrom = str(p.dateFrom, 10);
  const dateTo = str(p.dateTo, 10) || dateFrom;
  const d1 = DateTime5.fromISO(dateFrom, { zone: tz });
  const d2 = DateTime5.fromISO(dateTo, { zone: tz });
  if (!d1.isValid || !d2.isValid || d2 < d1) throw new UserError("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u044B");
  let start = d1.startOf("day");
  let end = d2.plus({ days: 1 }).startOf("day");
  if (p.timeFrom && p.timeTo) {
    if (!HM.test(p.timeFrom) || !HM.test(p.timeTo)) throw new UserError("\u0412\u0440\u0435\u043C\u044F \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 \u0427\u0427:\u041C\u041C");
    const [h1, m1] = p.timeFrom.split(":").map(Number);
    const [h2, m2] = p.timeTo.split(":").map(Number);
    start = d1.set({ hour: h1, minute: m1 });
    end = d2.set({ hour: h2, minute: m2 });
    if (end <= start) throw new UserError("\u041A\u043E\u043D\u0435\u0446 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043F\u043E\u0437\u0436\u0435 \u043D\u0430\u0447\u0430\u043B\u0430");
  }
  const staffId = p.staffId ? int(p.staffId, "staffId") : null;
  const [row] = await db().query(
    `insert into time_off (business_id, staff_id, starts_at, ends_at, reason) values ($1,$2,$3,$4,$5) returning *`,
    [ctx.business.id, staffId, start.toUTC().toISO(), end.toUTC().toISO(), str(p.reason, 100)]
  );
  const conflicts = await db().query(
    `select count(*)::int as n from bookings where business_id = $1 and status = 'confirmed'
     and starts_at < $3 and ends_at > $2 and ($4::bigint is null or staff_id = $4)`,
    [ctx.business.id, row.starts_at, row.ends_at, staffId]
  );
  return { ...row, conflicts: conflicts[0].n };
}
async function removeTimeOff(ctx, p) {
  await db().query(`delete from time_off where id = $1 and business_id = $2`, [int(p.id, "id"), ctx.business.id]);
  return { ok: true };
}
var SETTINGS_KEYS = [
  "emoji",
  "accent",
  "description",
  "address",
  "contactPhone",
  "links",
  "welcome",
  "afterBookingText",
  "labels",
  "stepMin",
  "minLeadMin",
  "maxDaysAhead",
  "cancelHours",
  "chooseStaff",
  "requirePhone",
  "remind2h",
  "fields"
];
async function saveSettings(ctx, p) {
  const incoming = p.settings ?? {};
  const settings = {};
  for (const k of SETTINGS_KEYS) if (k in incoming) settings[k] = incoming[k];
  for (const k of ["stepMin", "minLeadMin", "maxDaysAhead", "cancelHours"]) {
    if (k in settings) settings[k] = Math.max(0, Math.min(int(settings[k], k), 1e4));
  }
  if (settings.maxDaysAhead !== void 0 && settings.maxDaysAhead > 180) settings.maxDaysAhead = 180;
  if (settings.fields) {
    settings.fields = settings.fields.slice(0, 6).map((f, i) => ({
      key: str(f.key, 20).replace(/[^a-z0-9_]/gi, "") || `f${i}`,
      label: str(f.label, 60),
      placeholder: str(f.placeholder, 80),
      required: Boolean(f.required)
    })).filter((f) => f.label);
  }
  if (settings.links) {
    settings.links = settings.links.slice(0, 6).map((l) => ({ title: str(l.title, 30), url: str(l.url, 200) })).filter((l) => l.title && /^https?:\/\//.test(l.url));
  }
  for (const k of ["description", "welcome", "afterBookingText"]) {
    if (k in settings) settings[k] = str(settings[k], 1e3);
  }
  if (settings.accent && !/^#[0-9a-f]{6}$/i.test(settings.accent)) delete settings.accent;
  const b = await updateBusiness(db(), ctx.business.id, {
    name: p.name ? str(p.name, 80) : void 0,
    timezone: p.timezone ? str(p.timezone, 60) : void 0,
    settings
  });
  return publicBusiness(b);
}
async function portfolioAdd(ctx, p) {
  const b64 = String(p.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1e3) throw new UserError("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0444\u043E\u0442\u043E");
  if (buf.length > 35e5) throw new UserError("\u0424\u043E\u0442\u043E \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435");
  const count = await db().query(`select count(*)::int as n from portfolio where business_id = $1`, [ctx.business.id]);
  if (count[0].n >= 60) throw new UserError("\u0412 \u043F\u043E\u0440\u0442\u0444\u043E\u043B\u0438\u043E \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 60 \u0444\u043E\u0442\u043E");
  const { file_id } = await tg().sendPhoto(
    ctx.init.user.id,
    new Uint8Array(buf),
    `\u{1F5BC} \u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u043F\u043E\u0440\u0442\u0444\u043E\u043B\u0438\u043E \xAB${ctx.business.name}\xBB`
  );
  const [row] = await db().query(
    `insert into portfolio (business_id, file_id, caption, sort) values ($1, $2, $3, $4) returning id, caption`,
    [ctx.business.id, file_id, str(p.caption, 200), 0]
  );
  return row;
}
async function portfolioRemove(ctx, p) {
  await db().query(`delete from portfolio where id = $1 and business_id = $2`, [int(p.id, "id"), ctx.business.id]);
  return { ok: true };
}
async function adminClients(ctx) {
  return db().query(
    `select c.tg_id, c.name, c.phone, c.last_seen, c.blocked_bot,
       (select count(*) from bookings b where b.business_id = c.business_id and b.client_tg_id = c.tg_id and b.status in ('confirmed','done'))::int as visits
     from clients c where c.business_id = $1 order by c.last_seen desc limit 500`,
    [ctx.business.id]
  );
}
async function adminInvite(ctx, p) {
  const role = p.role === "owner" ? "owner" : "admin";
  if (role === "owner" && ctx.role !== "super" && ctx.role !== "owner") throw new UserError("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432");
  const code = await createInvite(db(), ctx.business.id, role, ctx.init.user.id);
  return { link: inviteLink(code), role };
}
async function adminRemove(ctx, p) {
  const tgId = int(p.tgId, "tgId");
  const [target] = await db().query(`select role from business_admins where business_id = $1 and tg_id = $2`, [ctx.business.id, tgId]);
  if (!target) return { ok: true };
  if (target.role === "owner") {
    const owners = await db().query(`select count(*)::int as n from business_admins where business_id = $1 and role='owner'`, [ctx.business.id]);
    if (owners[0].n <= 1 && ctx.role !== "super") throw new UserError("\u041D\u0435\u043B\u044C\u0437\u044F \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0435\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430");
  }
  await db().query(`delete from business_admins where business_id = $1 and tg_id = $2`, [ctx.business.id, tgId]);
  return { ok: true };
}
async function adminBroadcast(ctx, p) {
  const text = str(p.text, 3e3);
  if (text.length < 3) throw new UserError("\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0440\u0430\u0441\u0441\u044B\u043B\u043A\u0438");
  const [last] = await db().query(`select settings->>'lastBroadcastAt' as at from businesses where id = $1`, [ctx.business.id]);
  if (last?.at && Date.now() - Date.parse(last.at) < 6 * 36e5 && ctx.role !== "super") {
    throw new UserError("\u0420\u0430\u0441\u0441\u044B\u043B\u043A\u0443 \u043C\u043E\u0436\u043D\u043E \u0434\u0435\u043B\u0430\u0442\u044C \u043D\u0435 \u0447\u0430\u0449\u0435 \u0440\u0430\u0437\u0430 \u0432 6 \u0447\u0430\u0441\u043E\u0432");
  }
  await db().query(`update businesses set settings = settings || jsonb_build_object('lastBroadcastAt', now()::text) where id = $1`, [
    ctx.business.id
  ]);
  return broadcast(db(), ctx.business, text);
}
async function superList() {
  const [businesses, stats] = await Promise.all([allBusinesses(db()), platformStats(db())]);
  return { businesses: businesses.map((b) => ({ ...b, links: { client: clientLink(b.slug) } })), stats };
}
async function superCreate(ctx, p) {
  const b = await createBusinessFromTemplate(db(), {
    templateId: str(p.templateId, 30),
    name: str(p.name, 80),
    slug: p.slug ? str(p.slug, 40) : void 0,
    createdBy: ctx.init.user.id,
    timezone: p.timezone ? str(p.timezone, 60) : void 0
  });
  const code = await createInvite(db(), b.id, "owner", ctx.init.user.id);
  return { business: publicBusiness(b), links: links(b), ownerInvite: inviteLink(code) };
}
async function superSetStatus(_ctx, p) {
  const status2 = p.status === "blocked" ? "blocked" : "active";
  await db().query(`update businesses set status = $2 where id = $1`, [int(p.businessId, "businessId"), status2]);
  return { ok: true };
}
async function superDelete(_ctx, p) {
  const id = int(p.businessId, "businessId");
  const b = await requireBusiness(id);
  if (str(p.confirm, 60) !== b.slug) throw new UserError("\u0414\u043B\u044F \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u0441\u044B\u043B\u043A\u0443-\u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u0431\u0438\u0437\u043D\u0435\u0441\u0430");
  await db().query(`delete from businesses where id = $1`, [id]);
  return { ok: true };
}
var methods = {
  boot: { need: "user", fn: boot },
  availability: { need: "user", fn: availability2 },
  book: { need: "user", fn: book },
  myBookings: { need: "user", fn: myBookings },
  cancelMy: { need: "user", fn: cancelMy },
  createOwnBusiness: { need: "user", fn: createOwnBusiness },
  "admin.overview": { need: "admin", fn: adminOverview },
  "admin.bookings": { need: "admin", fn: adminBookings },
  "admin.cancelBooking": { need: "admin", fn: adminCancelBooking },
  "admin.setStatus": { need: "admin", fn: adminSetStatus },
  "admin.saveService": { need: "admin", fn: saveService },
  "admin.deleteService": { need: "admin", fn: deleteService },
  "admin.saveStaff": { need: "admin", fn: saveStaff },
  "admin.deleteStaff": { need: "admin", fn: deleteStaff },
  "admin.timeOff": { need: "admin", fn: listTimeOff },
  "admin.addTimeOff": { need: "admin", fn: addTimeOff },
  "admin.removeTimeOff": { need: "admin", fn: removeTimeOff },
  "admin.saveSettings": { need: "admin", fn: saveSettings },
  "admin.portfolio": { need: "admin", fn: (ctx) => listPortfolio(db(), ctx.business.id).then((l) => l.map(({ id, caption }) => ({ id, caption }))) },
  "admin.portfolioAdd": { need: "admin", fn: portfolioAdd },
  "admin.portfolioRemove": { need: "admin", fn: portfolioRemove },
  "admin.clients": { need: "admin", fn: adminClients },
  "admin.invite": { need: "admin", fn: adminInvite },
  "admin.removeAdmin": { need: "owner", fn: adminRemove },
  "admin.broadcast": { need: "owner", fn: adminBroadcast },
  "super.list": { need: "super", fn: superList },
  "super.create": { need: "super", fn: superCreate },
  "super.setStatus": { need: "super", fn: superSetStatus },
  "super.delete": { need: "super", fn: superDelete }
};
async function dispatch(method, params, ctx) {
  const m = methods[method];
  if (!m) throw new UserError("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u043C\u0435\u0442\u043E\u0434");
  const uid = ctx.init.user.id;
  const isSuper2 = config.superadmins.includes(uid);
  if (m.need === "user") return m.fn(ctx, params);
  if (m.need === "super") {
    if (!isSuper2) throw new UserError("\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430");
    return m.fn(ctx, params);
  }
  const business = await requireBusiness(params.businessId);
  const role = await roleFor(db(), uid, business.id, config.superadmins);
  if (!role) throw new UserError("\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u044D\u0442\u043E\u043C\u0443 \u0431\u0438\u0437\u043D\u0435\u0441\u0443");
  if (m.need === "owner" && role === "admin") throw new UserError("\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443");
  return m.fn({ ...ctx, business, role }, params);
}

// server/handler.ts
init_telegram();
var json = (data, status2 = 200, headers = {}) => new Response(JSON.stringify(data), { status: status2, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
var webhook = null;
function cronAuthorized(req, url) {
  if ((req.headers.get("user-agent") ?? "").startsWith("vercel-cron/")) return true;
  const secret = config.cronSecret;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("key") === secret;
}
var platformLoadedAt = 0;
var webhookEnsured = false;
async function refreshPlatform(force = false) {
  if (!force && Date.now() - platformLoadedAt < 6e4) return;
  platformLoadedAt = Date.now();
  try {
    const rows = await db().query(`select tg_id from platform_admins`);
    runtime.dbSuperadmins = rows.map((r) => Number(r.tg_id));
  } catch (e) {
    console.error("platform_admins", e);
  }
  if (!config.botToken) return;
  try {
    if (!runtime.botUsername) runtime.botUsername = (await rawApi().getMe()).username;
    if (config.isProduction && !webhookEnsured) {
      const info = await rawApi().getWebhookInfo();
      if (info.url !== `${config.publicUrl}/api/bot`) await setupBot();
      webhookEnsured = true;
    }
  } catch (e) {
    console.error("bot setup", e);
  }
}
async function rpc(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const init = verifyInitData(req.headers.get("x-init-data") ?? "", config.botToken);
    const body = await req.json();
    const result = await dispatch(String(body.method ?? ""), body.params ?? {}, { init });
    return json({ result });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error("rpc error", e);
    return json({ error: "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437." }, 500);
  }
}
async function photo(url) {
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
      "cache-control": "public, max-age=86400, s-maxage=31536000, immutable"
    }
  });
}
async function setupBot() {
  const api2 = rawApi();
  const base = config.publicUrl;
  await api2.setWebhook(`${base}/api/bot`, {
    secret_token: config.webhookSecret || void 0,
    allowed_updates: ["message", "my_chat_member"],
    drop_pending_updates: true
  });
  await api2.setMyCommands([
    { command: "start", description: "\u0413\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E" },
    { command: "admin", description: "\u041F\u0430\u043D\u0435\u043B\u044C \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0435\u0432 \u0431\u0438\u0437\u043D\u0435\u0441\u0430" },
    { command: "help", description: "\u041F\u043E\u043C\u043E\u0449\u044C" }
  ]);
  await api2.setChatMenuButton({ menu_button: { type: "web_app", text: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C", web_app: { url: webAppUrl() } } });
  await api2.setMyShortDescription("\u041E\u043D\u043B\u0430\u0439\u043D-\u0437\u0430\u043F\u0438\u0441\u044C \u043A \u043C\u0430\u0441\u0442\u0435\u0440\u0430\u043C \u0438 \u0432 \u0441\u0430\u043B\u043E\u043D\u044B \u043F\u0440\u044F\u043C\u043E \u0432 Telegram");
  await api2.setMyDescription(
    "\u0417\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0439\u0442\u0435\u0441\u044C \u043A \u043C\u0430\u0441\u0442\u0435\u0440\u0443 \u0432 \u043F\u0430\u0440\u0443 \u043A\u0430\u0441\u0430\u043D\u0438\u0439: \u0432\u044B\u0431\u043E\u0440 \u0443\u0441\u043B\u0443\u0433\u0438, \u0443\u0434\u043E\u0431\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F, \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F. \u041F\u0440\u0435\u0434\u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0442\u0435\u043B\u044F\u043C \u2014 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u0430\u044F \u043E\u043D\u043B\u0430\u0439\u043D-\u0437\u0430\u043F\u0438\u0441\u044C \u0434\u043B\u044F \u0431\u0438\u0437\u043D\u0435\u0441\u0430."
  );
}
async function status() {
  try {
    await db().query("select 1");
  } catch (e) {
    return json({ ok: false, db: false, error: String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/g, "<url>") }, 500);
  }
  const info = config.botToken ? await rawApi().getWebhookInfo() : null;
  return json({
    ok: true,
    db: true,
    bot: config.botUsername || null,
    webhook: info?.url ?? null,
    pending: info?.pending_update_count ?? null,
    lastError: info?.last_error_message ?? null,
    superadmins: config.superadmins.length
  });
}
async function handle(req) {
  const url = new URL(req.url);
  const route = url.searchParams.get("route") || url.pathname.replace(/^\/api\/?/, "");
  if (route !== "photo" && process.env.DATABASE_URL !== void 0) await refreshPlatform(route === "health");
  switch (route) {
    case "rpc":
      return rpc(req);
    case "bot": {
      if (config.webhookSecret && req.headers.get("x-telegram-bot-api-secret-token") !== config.webhookSecret) {
        return new Response("forbidden", { status: 403 });
      }
      webhook ??= webhookCallback(getBot(), "std/http", { timeoutMilliseconds: 25e3 });
      return webhook(req);
    }
    case "photo":
      return photo(url);
    case "cron":
      if (!cronAuthorized(req, url)) return new Response("forbidden", { status: 403 });
      return json(await runReminders());
    case "setup":
      if (!cronAuthorized(req, url)) return new Response("forbidden", { status: 403 });
      await setupBot();
      return status();
    case "health":
      return status();
    default:
      return json({ error: "not found" }, 404);
  }
}

// server/entry.ts
var entry_default = {
  fetch(request) {
    return handle(request);
  }
};
export {
  entry_default as default
};
