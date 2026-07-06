-- ManageMate フェーズ3: Google カレンダー連携用トークン保管
-- Supabase SQL Editor で実行する。
create table if not exists public.google_accounts (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email         text,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.google_accounts enable row level security;
drop policy if exists google_accounts_all_own on public.google_accounts;
create policy google_accounts_all_own on public.google_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
