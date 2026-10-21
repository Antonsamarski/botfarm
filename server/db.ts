import postgres from "postgres";

export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

let current: Db | null = null;

/** Для тестов и локального сервера: подменить подключение (PGlite). */
export function setDb(db: Db) {
  current = db;
}

export function db(): Db {
  if (current) return current;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  // Пулер Supabase (transaction mode, порт 6543) не поддерживает prepared statements.
  const sql = postgres(url, {
    prepare: false,
    max: 3, // несколько соединений на тёплый экземпляр; остальное держит пулер Supabase
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  current = wrapPostgres(sql);
  return current;
}

function wrapPostgres(sql: postgres.Sql<any>): Db {
  return {
    query: (text, params = []) => sql.unsafe(text, params as any[]) as any,
    tx: (fn) => sql.begin((t) => fn(wrapPostgres(t as unknown as postgres.Sql<any>))) as any,
  };
}

/** Ошибка нарушения ограничения пересечения записей. */
export function isOverlapError(e: unknown): boolean {
  const err = e as { code?: string; constraint_name?: string; message?: string };
  return err?.code === "23P01" || /bookings_no_overlap/.test(err?.message ?? "");
}
