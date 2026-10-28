// Проверка и нормализация телефона. Общий файл для сервера и Mini App (без зависимостей).
//
// Принимаем: российские/казахстанские номера в любом виде (8 999…, +7 999…, 999…),
// и международные в формате +<код страны><номер> (8–15 цифр).
// Отсекаем очевидный мусор: неверную длину, несуществующие коды (+7 0xx, 1xx, 2xx, 5xx, 6xx),
// номера из одинаковых цифр (+7 999 999-99-99, +7 900 000-00-00) и «по порядку» (+7 901 234-56-78).

export type PhoneCheck = { ok: true; phone: string } | { ok: false; error: string };

export const PHONE_ERROR = "Проверьте номер телефона — например, +7 999 123-45-67";

/** Красивый вид российского номера: +7 (999) 123-45-67 */
function formatRu(d: string): string {
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

function looksFake(national: string): boolean {
  const sub = national.slice(-7);
  if (/^(\d)\1+$/.test(sub)) return true; // 000-00-00, 999-99-99
  if (/^(\d)\1+$/.test(national)) return true;
  const seq = "01234567890123456789";
  const rev = "98765432109876543210";
  if (seq.includes(national) || rev.includes(national)) return true; // 9012345678, 1234567890
  return false;
}

export function checkPhone(raw: string): PhoneCheck {
  const s = String(raw ?? "").trim();
  let d = s.replace(/\D/g, "");
  if (!d) return { ok: false, error: "Укажите телефон" };

  const plus = s.startsWith("+");
  // Россия/Казахстан: 8XXXXXXXXXX, 7XXXXXXXXXX, +7XXXXXXXXXX, XXXXXXXXXX (10 цифр без кода)
  if (!plus && d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (!plus && d.length === 10 && d[0] === "9") d = "7" + d;

  if (d[0] === "7") {
    if (d.length !== 11) return { ok: false, error: PHONE_ERROR };
    const national = d.slice(1);
    // коды: 3xx, 4xx, 8xx (города, межгород), 9xx (мобильные), 7xx (Казахстан)
    if (!/^[34789]/.test(national)) return { ok: false, error: PHONE_ERROR };
    if (looksFake(national)) return { ok: false, error: PHONE_ERROR };
    return { ok: true, phone: formatRu(d) };
  }

  // Другие страны — только с «+» и кодом страны
  if (!plus || d.length < 8 || d.length > 15 || d[0] === "0" || looksFake(d.slice(-9))) {
    return { ok: false, error: PHONE_ERROR };
  }
  return { ok: true, phone: `+${d}` };
}

/**
 * Маска при вводе: «+7 (999) 123-45-67». Иностранный номер (начинается с «+», но не «+7») не трогаем.
 */
export function maskPhone(raw: string): string {
  const s = raw.trimStart();
  if (s.startsWith("+") && !s.startsWith("+7") && s.length > 1) return "+" + s.slice(1).replace(/[^\d ()-]/g, "");
  let d = s.replace(/\D/g, "");
  if (!d) return s.startsWith("+") ? "+" : "";
  if (d[0] === "8") d = "7" + d.slice(1);
  else if (d[0] === "9") d = "7" + d;
  else if (d[0] !== "7") d = "7" + d;
  d = d.slice(0, 11);
  const n = d.slice(1);
  let out = "+7";
  if (n.length) out += " (" + n.slice(0, 3);
  if (n.length > 3) out += ") " + n.slice(3, 6);
  if (n.length > 6) out += "-" + n.slice(6, 8);
  if (n.length > 8) out += "-" + n.slice(8, 10);
  return out;
}
