import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "../server/auth";

const TOKEN = "123456:TEST_TOKEN";

function sign(fields: Record<string, string>, token = TOKEN): string {
  const dataCheck = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = 1_800_000_000;
const user = JSON.stringify({ id: 42, first_name: "Аня", username: "anya" });

describe("verifyInitData", () => {
  it("принимает корректную подпись и отдаёт пользователя и start_param", () => {
    const init = sign({ auth_date: String(now), user, start_param: "nails-anna" });
    const res = verifyInitData(init, TOKEN, now * 1000);
    expect(res.user.id).toBe(42);
    expect(res.startParam).toBe("nails-anna");
  });

  it("отклоняет подделку", () => {
    const init = sign({ auth_date: String(now), user }, "999:OTHER");
    expect(() => verifyInitData(init, TOKEN, now * 1000)).toThrow();
  });

  it("отклоняет изменённые данные", () => {
    const init = sign({ auth_date: String(now), user }).replace("42", "43");
    expect(() => verifyInitData(init, TOKEN, now * 1000)).toThrow();
  });

  it("отклоняет устаревшие данные (старше 7 дней)", () => {
    const init = sign({ auth_date: String(now - 8 * 86400), user });
    expect(() => verifyInitData(init, TOKEN, now * 1000)).toThrow();
  });
});
