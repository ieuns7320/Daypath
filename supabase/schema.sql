-- Daypath 1단계 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요.
-- 새 프로젝트라면 이 파일을 실행한 뒤 supabase/migrations/ 의 파일을 번호 순서대로 실행하세요.
-- 모든 표는 user_id로 소유자를 구분하고, RLS로 본인 데이터만 읽고 쓸 수 있게 막습니다.

-- 카테고리 (일정당 1개, 블록 색)
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default 'gray',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 태그 (일정당 여러 개)
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default 'gray',
  created_at  timestamptz not null default now()
);

-- 일정
-- end_at은 "끝 미포함". 종일 일정은 마지막 날 다음 날 자정.
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default '',
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  all_day      boolean not null default false,
  category_id  uuid references public.categories (id) on delete set null,
  tag_ids      uuid[] not null default '{}',
  memo         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint events_time_order check (end_at >= start_at)
);

create index if not exists events_user_range_idx on public.events (user_id, start_at, end_at);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- Data API 권한: 로그인한 사용자(authenticated)에게만 표 접근을 허용한다.
-- ("Automatically expose new tables"를 꺼도 동작하도록 명시적으로 부여)
revoke all on public.categories, public.tags, public.events from anon;
grant select, insert, update, delete on public.categories, public.tags, public.events to authenticated;

-- RLS: 본인 데이터만
alter table public.categories enable row level security;
alter table public.tags       enable row level security;
alter table public.events     enable row level security;

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own tags" on public.tags;
create policy "own tags" on public.tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own events" on public.events;
create policy "own events" on public.events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 실시간 동기화: 다른 기기에서 바뀐 내용을 바로 받기
do $$
begin
  begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tags;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.events;     exception when duplicate_object then null; end;
end $$;
