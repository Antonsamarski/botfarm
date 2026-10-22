-- BotFarm: схема. Выполняется один раз в новом проекте Supabase.
create extension if not exists btree_gist;

create table if not exists users (
  tg_id            bigint primary key,
  first_name       text not null default '',
  username         text,
  last_business_id bigint,
  created_at       timestamptz not null default now(),
  seen_at          timestamptz not null default now()
);

create table if not exists businesses (
  id          bigint generated always as identity primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  name        text not null,
  template    text not null,
  status      text not null default 'active' check (status in ('active','blocked')),
  timezone    text not null default 'Europe/Moscow',
  -- тексты, контакты, правила записи, поля анкеты, термины, акцентный цвет
  settings    jsonb not null default '{}'::jsonb,
  created_by  bigint,
  created_at  timestamptz not null default now()
);

create table if not exists business_admins (
  business_id bigint not null references businesses(id) on delete cascade,
  tg_id       bigint not null,
  role        text not null default 'admin' check (role in ('owner','admin')),
  created_at  timestamptz not null default now(),
  primary key (business_id, tg_id)
);
create index if not exists business_admins_tg on business_admins(tg_id);

create table if not exists invites (
  code        text primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','admin')),
  created_by  bigint,
  used_by     bigint,
  used_at     timestamptz,
  expires_at  timestamptz not null default now() + interval '30 days'
);

create table if not exists staff (
  id          bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  name        text not null,
  description text not null default '',
  tg_id       bigint,                      -- если мастер хочет получать свои записи
  work_hours  jsonb not null default '{}'::jsonb, -- {"1":[["10:00","19:00"]],...}
  active      boolean not null default true,
  sort        int not null default 0
);
create index if not exists staff_business on staff(business_id);

create table if not exists services (
  id           bigint generated always as identity primary key,
  business_id  bigint not null references businesses(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  price        int not null default 0 check (price >= 0),
  price_from   boolean not null default false,  -- «от 1500 ₽»
  duration_min int not null default 60 check (duration_min between 5 and 720),
  active       boolean not null default true,
  sort         int not null default 0
);
create index if not exists services_business on services(business_id);

-- закрытое время: выходной, отпуск, перерыв. staff_id null = для всех мастеров
create table if not exists time_off (
  id          bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  staff_id    bigint references staff(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null check (ends_at > starts_at),
  reason      text not null default ''
);
create index if not exists time_off_lookup on time_off(business_id, starts_at);

create table if not exists bookings (
  id            bigint generated always as identity primary key,
  business_id   bigint not null references businesses(id) on delete cascade,
  staff_id      bigint not null references staff(id) on delete cascade,
  service_id    bigint references services(id) on delete set null,
  service_title text not null,
  price         int not null default 0,
  client_tg_id  bigint not null,
  client_name   text not null,
  client_phone  text not null default '',
  answers       jsonb not null default '{}'::jsonb,
  comment       text not null default '',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  status        text not null default 'confirmed'
                check (status in ('confirmed','cancelled','done','no_show')),
  cancelled_by  text check (cancelled_by in ('client','admin')),
  reminded_24h  boolean not null default false,
  reminded_2h   boolean not null default false,
  created_at    timestamptz not null default now(),
  -- главное: у одного мастера не может быть двух пересекающихся активных записей
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed')
);
create index if not exists bookings_business_time on bookings(business_id, starts_at);
create index if not exists bookings_client on bookings(client_tg_id, starts_at);
create index if not exists bookings_reminders on bookings(starts_at) where status = 'confirmed';

-- клиенты конкретного бизнеса: для рассылки и мини-CRM
create table if not exists clients (
  business_id bigint not null references businesses(id) on delete cascade,
  tg_id       bigint not null,
  name        text not null default '',
  phone       text not null default '',
  note        text not null default '',
  blocked_bot boolean not null default false,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (business_id, tg_id)
);

create table if not exists portfolio (
  id          bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  file_id     text not null,
  caption     text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists portfolio_business on portfolio(business_id, sort);

-- владельцы платформы (суперадмины) в дополнение к SUPERADMIN_IDS
create table if not exists platform_admins (
  tg_id bigint primary key,
  note  text not null default ''
);

-- Доступ к таблицам только с сервера (роль postgres). Публичный REST Supabase закрыт:
alter table users enable row level security;
alter table businesses enable row level security;
alter table business_admins enable row level security;
alter table invites enable row level security;
alter table staff enable row level security;
alter table services enable row level security;
alter table time_off enable row level security;
alter table bookings enable row level security;
alter table clients enable row level security;
alter table portfolio enable row level security;
alter table platform_admins enable row level security;
