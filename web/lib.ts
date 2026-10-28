// Обёртки над Telegram WebApp, API и форматированием.

declare global {
  interface Window {
    Telegram?: { WebApp: any };
  }
}

export const WA: any = window.Telegram?.WebApp ?? null;
export const inTelegram = Boolean(WA?.initData);

let devInitData = "";

export async function ensureDevAuth() {
  if (inTelegram) return;
  const q = new URLSearchParams(location.search);
  const user = q.get("devUser") ?? localStorageGet("devUser") ?? "1";
  const res = await fetch(`/api/dev-init?user=${encodeURIComponent(user)}&start=${encodeURIComponent(q.get("start") ?? "")}`);
  if (res.ok) devInitData = await res.text();
}

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export class ApiError extends Error {}

export async function api<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json", "x-init-data": WA?.initData || devInitData },
    body: JSON.stringify({ method, params }),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте интернет.");
  }
  if (!res.ok) throw new ApiError(data?.error ?? "Ошибка");
  return data.result as T;
}

export const startParam: string | undefined = WA?.initDataUnsafe?.start_param || undefined;
export const urlParams = new URLSearchParams(location.search);

export function haptic(kind: "success" | "error" | "warning" | "light" = "light") {
  try {
    if (kind === "light") WA?.HapticFeedback?.impactOccurred("light");
    else WA?.HapticFeedback?.notificationOccurred(kind);
  } catch {}
}

export function alertMsg(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (WA?.showAlert) WA.showAlert(text, () => resolve());
    else {
      window.alert(text);
      resolve();
    }
  });
}

export function confirmMsg(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (WA?.showConfirm) WA.showConfirm(text, (ok: boolean) => resolve(ok));
    else resolve(window.confirm(text));
  });
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function shareLink(url: string, text: string) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (WA?.openTelegramLink) WA.openTelegramLink(share);
  else window.open(share, "_blank");
}

export function openLink(url: string) {
  if (url.startsWith("https://t.me/") && WA?.openTelegramLink) WA.openTelegramLink(url);
  else if (WA?.openLink) WA.openLink(url);
  else window.open(url, "_blank");
}

/** Попросить разрешение писать в личку — иначе клиент, открывший приложение по прямой ссылке, не получит напоминания. */
export function ensureWriteAccess(): Promise<void> {
  return new Promise((resolve) => {
    if (!WA?.requestWriteAccess || WA.initDataUnsafe?.user?.allows_write_to_pm) return resolve();
    try {
      WA.requestWriteAccess(() => resolve());
    } catch {
      resolve();
    }
  });
}

// ---------- даты ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export const fmtTime = (iso: string | Date, tz: string) => fmt(tz, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const fmtDay = (iso: string | Date, tz: string) => fmt(tz, { weekday: "short", day: "numeric", month: "long" }).format(new Date(iso));
export const fmtDayShort = (iso: string | Date, tz: string) => fmt(tz, { day: "numeric", month: "short" }).format(new Date(iso));
export const fmtWeekday = (iso: string | Date, tz: string) => fmt(tz, { weekday: "short" }).format(new Date(iso));

/** YYYY-MM-DD → Date в полдень UTC (для отображения даты без сдвигов). */
export const dateOnly = (d: string) => new Date(`${d}T12:00:00Z`);

export function todayIn(tz: string): string {
  const p = fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const rub = (n: number, from = false) => (n === 0 ? "бесплатно" : `${from ? "от " : ""}${n.toLocaleString("ru-RU")} ₽`);

export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} ч` : "", m ? `${m} мин` : ""].filter(Boolean).join(" ");
}

export const photoUrl = (id: number) => `/api/photo?id=${id}`;

/** Баннер бизнеса; хвост file_id в адресе сбрасывает кэш при замене фото. */
export const bannerUrl = (businessId: number, fileId?: string) =>
  fileId ? `/api/photo?banner=${businessId}&v=${encodeURIComponent(fileId.slice(-12))}` : null;

/** Сжать фото в браузере перед загрузкой (≤1600px, JPEG). */
export async function compressImage(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export const RU_TIMEZONES: [string, string][] = [
  ["Europe/Kaliningrad", "Калининград (МСК−1)"],
  ["Europe/Moscow", "Москва (МСК)"],
  ["Europe/Samara", "Самара (МСК+1)"],
  ["Asia/Yekaterinburg", "Екатеринбург (МСК+2)"],
  ["Asia/Omsk", "Омск (МСК+3)"],
  ["Asia/Novosibirsk", "Новосибирск (МСК+4)"],
  ["Asia/Krasnoyarsk", "Красноярск (МСК+4)"],
  ["Asia/Irkutsk", "Иркутск (МСК+5)"],
  ["Asia/Yakutsk", "Якутск (МСК+6)"],
  ["Asia/Vladivostok", "Владивосток (МСК+7)"],
  ["Asia/Magadan", "Магадан (МСК+8)"],
  ["Asia/Kamchatka", "Камчатка (МСК+9)"],
  ["Asia/Almaty", "Алматы"],
  ["Asia/Tashkent", "Ташкент"],
  ["Europe/Minsk", "Минск"],
];
