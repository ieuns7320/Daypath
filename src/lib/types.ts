import type { ColorKey } from "./palette";

export type Category = {
  id: string;
  name: string;
  color: ColorKey;
  sort_order: number;
};

export type Tag = {
  id: string;
  name: string;
  color: ColorKey;
};

/**
 * 일정.
 * - start_at / end_at: ISO 문자열. end_at은 FullCalendar와 같은 "끝 미포함" 규칙.
 * - 종일 일정은 로컬 자정 기준이며, 마지막 날 다음 날 자정이 end_at.
 */
export type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category_id: string | null;
  tag_ids: string[];
  memo: string;
};

/**
 * 할 일.
 * - due_date: 마감일 "YYYY-MM-DD" (선택)
 * - scheduled_start / scheduled_end: 타임 블로킹으로 배정한 작업 시간 (둘 다 있거나 둘 다 없음, 끝 미포함)
 */
export type Task = {
  id: string;
  title: string;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  done: boolean;
  done_at: string | null;
  category_id: string | null;
  tag_ids: string[];
  memo: string;
  created_at: string;
};

export type Snapshot = {
  events: CalendarEvent[];
  tasks: Task[];
  categories: Category[];
  tags: Tag[];
};
