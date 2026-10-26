import postgres from "postgres";
import { SCHEMA_SQL } from "./schema.gen.js";

export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

let current: Db | null = null;

/** Для тестов и локального сервера: подменить подключение (PGlite). */
export function setDb(db: Db) {
  current = db;
}

/**
 * Адрес базы: DATABASE_URL (вставлен руками) или POSTGRES_URL (его сама прописывает интеграция
 * Supabase в Vercel). Из адреса интеграции убираем лишние параметры вроде `supa=base-pooler.x`:
 * postgres.js отправил бы их серверу как настройки, и подключение упало бы.
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): { url: string; ssl: boolean } | null {
  const raw = (env.DATABASE_URL || env.POSTGRES_URL || "").trim();
  if (!raw) return null;
  const u = new URL(raw);
  const sslmode = u.searchParams.get("sslmode");
  u.search = "";
  const ssl = sslmode === "require" || /supabase\.(co|com)$/.test(u.hostname);
  return { url: u.toString(), ssl };
}

export function db(): Db {
  if (current) return current;
  const resolved = resolveDatabaseUrl();
  if (!resolved) throw new Error("Не задан адрес базы: DATABASE_URL или POSTGRES_URL");
  // Пулер Supabase (transaction mode, порт 6543) не поддерживает prepared statements.
  const sql = postgres(resolved.url, {
    prepare: false,
    ssl: resolved.ssl ? "require" : undefined,
    max: 3, // несколько соединений на тёплый экземпляр; остальное держит пулер Supabase
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  const ready = ensureSchema(sql).catch((e) => {
    console.error("ensureSchema", e);
  });
  current = wrapPostgres(sql, ready);
  return current;
}

/** Владельцы платформы по умолчанию: Антон и Дмитрий. */
const DEFAULT_SUPERADMINS: [number, string][] = [
  [8181483439, "Антон"],
  [2015823821, "Дмитрий"],
];

/**
 * Пустая база → создаём таблицы сами (db/001_init.sql зашит в бандл) и добавляем суперадминов.
 * Переезд на новый Supabase не требует ручного SQL. Если таблицы уже есть — ничего не делаем.
 */
async function ensureSchema(sql: postgres.Sql<any>) {
  const [row] = await sql.unsafe(`select to_regclass('businesses') is not null as ok`);
  if (row?.ok) return;
  try {
    await sql.unsafe(`create extension if not exists btree_gist with schema extensions`);
  } catch {
    // не Supabase: расширение поставит сама схема
  }
  await sql.unsafe(SCHEMA_SQL);
  for (const [id, note] of DEFAULT_SUPERADMINS) {
    await sql.unsafe(`insert into platform_admins (tg_id, note) values ($1, $2) on conflict do nothing`, [id, note]);
  }
  console.log("Схема БД создана");
}

function wrapPostgres(sql: postgres.Sql<any>, ready: Promise<unknown> = Promise.resolve()): Db {
  return {
    query: async (text, params = []) => {
      await ready;
      return sql.unsafe(text, params as any[]) as any;
    },
    tx: async (fn) => {
      await ready;
      return sql.begin((t) => fn(wrapPostgres(t as unknown as postgres.Sql<any>))) as any;
    },
  };
}

/** Ошибка нарушения ограничения пересечения записей. */
export function isOverlapError(e: unknown): boolean {
  const err = e as { code?: string; constraint_name?: string; message?: string };
  return err?.code === "23P01" || /bookings_no_overlap/.test(err?.message ?? "");
}
