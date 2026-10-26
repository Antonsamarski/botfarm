import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "../server/db";
import { isProductionHost } from "../server/config";
import { SCHEMA_SQL } from "../server/schema.gen";

describe("адрес базы", () => {
  it("берёт DATABASE_URL как есть", () => {
    const r = resolveDatabaseUrl({ DATABASE_URL: "postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:6543/postgres" });
    expect(r).toEqual({ url: "postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:6543/postgres", ssl: true });
  });

  it("принимает POSTGRES_URL от интеграции Supabase и выкидывает лишние параметры", () => {
    const r = resolveDatabaseUrl({
      POSTGRES_URL: "postgres://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    });
    expect(r!.url).toBe("postgres://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
    expect(r!.ssl).toBe(true);
  });

  it("без переменных — null", () => {
    expect(resolveDatabaseUrl({})).toBeNull();
  });
});

describe("основной домен Vercel", () => {
  it("узнаёт основной адрес проекта", () => {
    expect(isProductionHost("botfarm-zapis.vercel.app")).toBe(true);
    expect(isProductionHost("zapis-dima.vercel.app")).toBe(true);
  });
  it("не путает с адресами отдельных сборок", () => {
    expect(isProductionHost("botfarm-zapis-i73lziuxe-antonsamarskis-projects.vercel.app")).toBe(false);
    expect(isProductionHost("botfarm-zapis-git-main-antonsamarskis-projects.vercel.app")).toBe(false);
    expect(isProductionHost("localhost:8787")).toBe(false);
  });
});

it("зашитая схема совпадает с db/001_init.sql (иначе: npm run build:api)", () => {
  expect(SCHEMA_SQL).toBe(readFileSync(new URL("../db/001_init.sql", import.meta.url), "utf8"));
});
