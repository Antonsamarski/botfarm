// Зашивает db/001_init.sql в server/schema.gen.ts, чтобы сервер мог сам создать таблицы в пустой базе.
import { readFileSync, writeFileSync } from "node:fs";
const sql = readFileSync(new URL("../db/001_init.sql", import.meta.url), "utf8");
writeFileSync(
  new URL("../server/schema.gen.ts", import.meta.url),
  `// Сгенерировано scripts/gen-schema.mjs из db/001_init.sql — не править руками.\nexport const SCHEMA_SQL = ${JSON.stringify(sql)};\n`,
);
console.log("server/schema.gen.ts обновлён");
