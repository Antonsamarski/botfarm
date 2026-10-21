-- Необязательно: частые напоминания (за 24 ч и за 2 ч) бесплатно силами Supabase.
-- Vercel Hobby запускает cron только раз в сутки, поэтому дёргаем /api/cron из базы каждые 15 минут.
-- Перед запуском замените <URL> и <CRON_SECRET>.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'botfarm-reminders',
  '*/15 * * * *',
  $$ select net.http_get(url := '<URL>/api/cron?key=<CRON_SECRET>', timeout_milliseconds := 30000) $$
);

-- отключить: select cron.unschedule('botfarm-reminders');
