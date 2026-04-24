create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nickname text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  barcode text,
  name text,
  brand text,
  category text not null default 'other',
  photo_url text,
  rating int not null check (rating between 0 and 10),
  taste_rating int check (taste_rating between 0 and 10),
  quality_rating int check (quality_rating between 0 and 10),
  price_rating int check (price_rating between 0 and 10),
  pros text,
  cons text,
  note_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, barcode)
);

create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  grantee_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  unique(owner_id, grantee_id)
);

create table if not exists reward_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text not null,
  activity_key text not null,
  period_days int not null default 0,
  target_count int not null check (target_count > 0),
  points int not null check (points > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  activity_key text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  rule_id uuid not null references reward_rules(id) on delete cascade,
  points int not null,
  context text,
  created_at timestamptz not null default now(),
  unique (user_id, rule_id, context)
);
