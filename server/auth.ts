import { createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface InitData {
  user: TgUser;
  startParam?: string;
  authDate: number;
}

export class AuthError extends Error {}

const MAX_AGE_SEC = 7 * 24 * 3600;

/** Проверка подписи Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export function verifyInitData(raw: string, botToken: string, nowMs = Date.now()): InitData {
  if (!raw) throw new AuthError("Нет данных авторизации");
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) throw new AuthError("Нет подписи");
  params.delete("hash");

  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AuthError("Неверная подпись");
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate || nowMs / 1000 - authDate > MAX_AGE_SEC) throw new AuthError("Сессия устарела, откройте приложение заново");

  const userRaw = params.get("user");
  if (!userRaw) throw new AuthError("Нет пользователя");
  const user = JSON.parse(userRaw) as TgUser;
  return { user, startParam: params.get("start_param") ?? undefined, authDate };
}
