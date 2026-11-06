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

export type Snapshot = {
  events: CalendarEvent[];
  categories: Category[];
  tags: Tag[];
};
