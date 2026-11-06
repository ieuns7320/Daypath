-- Daypath 2단계: 할 일(tasks) 테이블
-- 이미 schema.sql(1단계)을 실행한 프로젝트에서는 이 파일만 SQL Editor에서 실행하세요.
-- 여러 번 실행해도 안전합니다.

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title            text not null default '',
  due_date         date,                      -- 마감일 (선택)
  scheduled_start  timestamptz,               -- 타임 블로킹: 작업 시간 시작 (선택)
  scheduled_end    timestamptz,               -- 타임 블로킹: 작업 시간 끝 (끝 미포함)
  done             boolean not null default false,
  done_at          timestamptz,
  category_id      uuid references public.categories (id) on delete set null,
  tag_ids          uuid[] not null default '{}',
  memo             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tasks_schedule_pair check ((scheduled_start is null) = (scheduled_end is null)),
  constraint tasks_schedule_order check (scheduled_end is null or scheduled_end > scheduled_start)
);

create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date);

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;

alter table public.tasks enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
begin
  begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end;
end $$;
