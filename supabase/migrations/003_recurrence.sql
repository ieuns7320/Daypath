-- Daypath 3단계(3a): 반복 일정
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 반복 일정은 "규칙 한 줄"만 저장하고, 회차는 앱이 화면에 보이는 기간만 계산해서 펼칩니다.
--   rrule         반복 규칙 (RFC 5545 RRULE 형식의 일부). 예: FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231
--                 UNTIL은 날짜(YYYYMMDD)만 쓰며 그날 회차까지 포함. null이면 반복 없음.
--   exdates       반복에서 빠진 회차의 날짜 (회차 시작일, 로컬 날짜)
--   series_id     "이 일정만" 고쳐서 떼어 낸 회차일 때, 원래 반복 일정의 id
--   original_date 떼어 낸 회차가 원래 반복에서 몇 월 며칠 회차였는지

alter table public.events
  add column if not exists rrule         text,
  add column if not exists exdates       date[] not null default '{}',
  add column if not exists series_id     uuid references public.events (id) on delete cascade,
  add column if not exists original_date date;

create index if not exists events_series_idx on public.events (series_id);
