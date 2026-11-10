-- Daypath 5단계: 가계부 (2026-11-10)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- - money_categories: 가계부 분류 (지출/수입, 색, 순서). 캘린더·할 일 카테고리와 따로
-- - money_entries: 내역 (날짜, 지출/수입, 금액(원), 분류, 내용). 고정 항목에서 자동으로 만든 것은 recurring_id
-- - money_recurring: 고정 지출·수입 (매달 며칠, 시작·끝 달, 지운 달) — 5b에서 화면을 붙인다
-- - money_budgets: 월 예산. month부터 다음 기록 전까지 매달 같은 금액 (amount null = 예산 안 씀)

-- ---------- 분류 ----------
create table if not exists public.money_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  color       text not null default 'gray',
  type        text not null default 'expense' check (type in ('expense', 'income')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists money_categories_user_idx on public.money_categories (user_id);

drop trigger if exists money_categories_touch_updated_at on public.money_categories;
create trigger money_categories_touch_updated_at
  before update on public.money_categories
  for each row execute function public.touch_updated_at();

-- ---------- 고정 지출·수입 ----------
create table if not exists public.money_recurring (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null default 'expense' check (type in ('expense', 'income')),
  amount       bigint not null default 0 check (amount >= 0),
  category_id  uuid references public.money_categories (id) on delete set null,
  title        text not null default '',
  day          integer not null default 1 check (day between 1 and 31),  -- 31이면 그달 말일
  start_month  date not null,                -- 이 달부터 (그 달 1일)
  end_month    date,                         -- 이 달까지 (null = 계속)
  skipped      date[] not null default '{}', -- 자동 내역을 지운 날짜 (다시 만들지 않음)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists money_recurring_user_idx on public.money_recurring (user_id);

drop trigger if exists money_recurring_touch_updated_at on public.money_recurring;
create trigger money_recurring_touch_updated_at
  before update on public.money_recurring
  for each row execute function public.touch_updated_at();

-- ---------- 내역 ----------
create table if not exists public.money_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null,
  type          text not null default 'expense' check (type in ('expense', 'income')),
  amount        bigint not null default 0 check (amount >= 0),
  category_id   uuid references public.money_categories (id) on delete set null,
  title         text not null default '',
  recurring_id  uuid references public.money_recurring (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists money_entries_user_date_idx on public.money_entries (user_id, date);
-- 같은 고정 항목의 같은 날 내역은 하나만 (두 기기가 동시에 자동 기록해도)
create unique index if not exists money_entries_recurring_date_key
  on public.money_entries (recurring_id, date) where recurring_id is not null;

drop trigger if exists money_entries_touch_updated_at on public.money_entries;
create trigger money_entries_touch_updated_at
  before update on public.money_entries
  for each row execute function public.touch_updated_at();

-- ---------- 월 예산 ----------
create table if not exists public.money_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month       date not null,     -- 이 달부터 적용 (그 달 1일)
  amount      bigint check (amount is null or amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists money_budgets_user_idx on public.money_budgets (user_id, month);

drop trigger if exists money_budgets_touch_updated_at on public.money_budgets;
create trigger money_budgets_touch_updated_at
  before update on public.money_budgets
  for each row execute function public.touch_updated_at();

-- ---------- 권한 (자기 데이터만) ----------
do $$
declare t text;
begin
  foreach t in array array['money_categories', 'money_recurring', 'money_entries', 'money_budgets'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own %s" on public.%I', t, t);
    execute format(
      'create policy "own %s" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t, t);
  end loop;
end $$;

-- ---------- 실시간 동기화 ----------
do $$
begin
  begin alter publication supabase_realtime add table public.money_categories; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.money_recurring;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.money_entries;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.money_budgets;    exception when duplicate_object then null; end;
end $$;
