-- Daypath 4b: 목표 시작일 (타임라인 막대의 왼쪽 끝) (2026-11-09)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요. 여러 번 실행해도 안전합니다.
-- 006_roadmap.sql을 먼저 실행해야 합니다.
--
-- start_date가 비어 있으면 앱은 목표를 만든 날부터 막대를 그린다.

alter table public.goals add column if not exists start_date date;
