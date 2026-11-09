-- Daypath 4단계: 로드맵 (목표 → 마일스톤 → 할 일·일정) (2026-11-09)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- - goals: 목표 (색, 목표일, 메모, 보관)
-- - milestones: 목표 아래 단계 (목표일, 할 일이 없을 때 쓰는 완료 표시)
-- - tasks.milestone_id / events.milestone_id: 마일스톤 연결 (마일스톤을 지우면 연결만 풀림)
--   진행률은 할 일로만 계산하고, 일정은 "관련 일정"으로 보여 주기만 한다.

-- ---------- 목표 ----------
create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default '',
  color        text not null default 'blue',
  target_date  date,                      -- 목표일 (선택)
  memo         text not null default '',
  archived     boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists goals_user_idx on public.goals (user_id);

drop trigger if exists goals_touch_updated_at on public.goals;
create trigger goals_touch_updated_at
  before update on public.goals
  for each row execute function public.touch_updated_at();

-- ---------- 마일스톤 ----------
create table if not exists public.milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id      uuid not null references public.goals (id) on delete cascade,
  title        text not null default '',
  target_date  date,                      -- 목표일 (선택)
  done         boolean not null default false,  -- 연결된 할 일이 없을 때만 쓰는 완료 표시
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists milestones_goal_idx on public.milestones (goal_id);

drop trigger if exists milestones_touch_updated_at on public.milestones;
create trigger milestones_touch_updated_at
  before update on public.milestones
  for each row execute function public.touch_updated_at();

-- ---------- 할 일·일정 연결 ----------
alter table public.tasks
  add column if not exists milestone_id uuid references public.milestones (id) on delete set null;
alter table public.events
  add column if not exists milestone_id uuid references public.milestones (id) on delete set null;

create index if not exists tasks_milestone_idx on public.tasks (milestone_id);
create index if not exists events_milestone_idx on public.events (milestone_id);

-- ---------- 권한 (자기 데이터만) ----------
revoke all on public.goals from anon;
revoke all on public.milestones from anon;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.milestones to authenticated;

alter table public.goals enable row level security;
alter table public.milestones enable row level security;

drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own milestones" on public.milestones;
create policy "own milestones" on public.milestones
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- 실시간 동기화 ----------
do $$
begin
  begin alter publication supabase_realtime add table public.goals;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.milestones; exception when duplicate_object then null; end;
end $$;
