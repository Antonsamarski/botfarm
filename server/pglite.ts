// Встраиваемый Postgres для тестов и локального запуска без интернета.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.js";

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = await PGlite.create({ dataDir, extensions: { btree_gist } });
  const schema = readFileSync(fileURLToPath(new URL("../db/001_init.sql", import.meta.url)), "utf8");
  await pg.exec(schema);
  const wrap = (q: { query: PGlite["query"] }): Db => ({
    query: async (text, params = []) => (await q.query(text, params as any[])).rows as any[],
    tx: (fn) => pg.transaction((t) => fn(wrap(t as any))) as any,
  });
  return wrap(pg);
}
