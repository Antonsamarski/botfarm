# План реализации BotFarm

Дизайн: `docs/design.md`. Стек: TypeScript, Vite + React (web/), Vercel Functions (api/),
Postgres (Supabase) через `postgres`, бот на grammY, тесты vitest + PGlite.

## Структура
```
api/bot.ts        вебхук Telegram
api/rpc.ts        POST: API Mini App; GET ?photo=: отдача фото из Telegram с CDN-кэшем
api/cron.ts       напоминания (Vercel Cron раз в сутки / pg_cron каждые 15 мин)
api/setup.ts      одноразовая настройка вебхука, команд и кнопки меню
db/001_init.sql   схема
db/002_pg_cron.sql  опционально: частые напоминания
server/           логика: db, auth, slots, templates, сервисы, бот, уведомления
web/              Mini App
tests/            vitest
```

## Шаги (TDD для ядра)
1. `server/slots.ts` — чистая функция расчёта слотов (часовой пояс, длительность, занятость,
   запас до записи, горизонт). Тесты сначала.
2. `server/auth.ts` — проверка initData. Тест с подписью, сгенерированной в тесте.
3. `db/001_init.sql` + `server/db.ts` (адаптер postgres/PGlite). Тест: две одновременные записи
   на пересекающееся время → одна падает с понятной ошибкой.
4. `server/templates.ts` — 5 шаблонов, `createBusinessFromTemplate`.
5. `server/rpc/*` — методы клиента, админа, суперадмина с проверкой роли. Тесты на права.
6. `server/bot.ts` — /start с slug/инвайтом, меню, уведомления.
7. `api/cron` — напоминания, идемпотентно (флаги reminded_*).
8. `web/` — экраны клиента, админа, суперадмина; MainButton/BackButton Telegram.
9. Проверка: typecheck, тесты, сборка, локальный dev-сервер на PGlite, скриншоты.
10. DEPLOY.md — пошагово для аккаунта друга.
