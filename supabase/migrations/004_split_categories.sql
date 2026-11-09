-- Daypath: 캘린더와 할 일의 카테고리·태그 분리 (2026-11-09)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- categories / tags 에 kind 칸을 추가한다.
--   'event' = 캘린더(일정)용, 'task' = 할 일용
-- 지금 있는 카테고리·태그는 모두 캘린더용('event')이 된다.
-- 기존 할 일은 캘린더용 카테고리·태그를 더 쓸 수 없으므로 연결을 뗀다("카테고리 없음", 태그 없음).
-- (할 일 자체는 지우지 않는다)

alter table public.categories
  add column if not exists kind text not null default 'event';

alter table public.tags
  add column if not exists kind text not null default 'event';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_kind_check') then
    alter table public.categories
      add constraint categories_kind_check check (kind in ('event', 'task'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tags_kind_check') then
    alter table public.tags
      add constraint tags_kind_check check (kind in ('event', 'task'));
  end if;
end $$;

-- 기존 할 일에서 캘린더용 카테고리·태그 연결 떼기
update public.tasks t
set category_id = null
where t.category_id in (select id from public.categories where kind = 'event');

update public.tasks t
set tag_ids = array(
  select x from unnest(t.tag_ids) as x
  where x not in (select id from public.tags where kind = 'event')
)
where t.tag_ids <> '{}';
