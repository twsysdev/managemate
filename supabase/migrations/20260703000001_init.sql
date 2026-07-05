-- ─────────────────────────────────────────────────────────────
-- ManageMate フェーズ2 初期スキーマ ＋ RLS
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
--
-- 方針（引き継ぎ書 セクション5）:
--   ・全テーブルに user_id を持たせ、RLS を必ず有効化
--   ・ポリシーは user_id = auth.uid() の行のみ read/write 可
--   ・設定系（masters / notify_settings / ext_calendars）もユーザーごと
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── profiles（auth.users と 1:1） ──────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- ── items（タスク/メモ/予定。単一テーブルを kind で区分） ──────
-- 注: 予約語を避け、分類は a/b/c、日時は start_at/end_at（テキスト）で保持。
--     日時は "YYYY-MM-DDTHH:MM"（時刻あり）or "YYYY-MM-DD"（終日）。
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('task','memo','event')),
  title      text not null default '',
  a          text default '',
  b          text default '',
  c          text default '',
  detail1    text default '',
  detail2    text default '',
  start_at   text default '',
  end_at     text default '',
  files      text[] not null default '{}',
  done       boolean not null default false,
  notify     integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.items enable row level security;
create index if not exists items_user_id_idx on public.items(user_id);

drop policy if exists items_select_own on public.items;
create policy items_select_own on public.items
  for select using (user_id = auth.uid());
drop policy if exists items_insert_own on public.items;
create policy items_insert_own on public.items
  for insert with check (user_id = auth.uid());
drop policy if exists items_update_own on public.items;
create policy items_update_own on public.items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists items_delete_own on public.items;
create policy items_delete_own on public.items
  for delete using (user_id = auth.uid());

-- ── masters（分類マスタ。アプリの {A,B,C} 形状を JSONB で保持） ──
create table if not exists public.masters (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.masters enable row level security;
drop policy if exists masters_all_own on public.masters;
create policy masters_all_own on public.masters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── notify_settings（通知の全体設定。1ユーザー1行） ────────────
create table if not exists public.notify_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  enabled       boolean not null default true,
  default_lead  integer not null default 10,
  task_lead     integer not null default 1440,
  overdue       boolean not null default true,
  quiet_start   text not null default '22:00',
  quiet_end     text not null default '07:00',
  quiet_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table public.notify_settings enable row level security;
drop policy if exists notify_all_own on public.notify_settings;
create policy notify_all_own on public.notify_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── ext_calendars（連携カレンダー。予定は JSONB で保持） ────────
create table if not exists public.ext_calendars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default '',
  color      text not null default '#4285F4',
  source     text default '',
  enabled    boolean not null default true,
  events     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.ext_calendars enable row level security;
create index if not exists ext_calendars_user_id_idx on public.ext_calendars(user_id);
drop policy if exists extcal_all_own on public.ext_calendars;
create policy extcal_all_own on public.ext_calendars
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 新規ユーザー登録時に profiles を自動作成 ────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
