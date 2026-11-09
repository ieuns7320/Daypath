import type { ColorKey } from "./palette";

/** 카테고리·태그를 어디에 쓰는지: 캘린더(일정)용 / 할 일용. 서로 섞어 쓰지 않는다. */
export type Kind = "event" | "task";

export type Category = {
  id: string;
  name: string;
  color: ColorKey;
  sort_order: number;
  kind: Kind;
};

export type Tag = {
  id: string;
  name: string;
  color: ColorKey;
  kind: Kind;
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
  /** 반복 규칙 (RRULE 일부, lib/recurrence.ts). null이면 반복 없음 */
  rrule: string | null;
  /** 반복에서 빠진 회차의 시작 날짜 "YYYY-MM-DD" */
  exdates: string[];
  /** "이 일정만" 고쳐 떼어 낸 회차면 원래 반복 일정 id */
  series_id: string | null;
  /** 떼어 낸 회차가 원래 몇 월 며칠 회차였는지 "YYYY-MM-DD" */
  original_date: string | null;
};

/** 반복 관련 칸의 기본값 (예전 데이터·새 일정에 채워 넣을 때) */
export const NO_RECURRENCE = {
  rrule: null,
  exdates: [] as string[],
  series_id: null,
  original_date: null,
} satisfies Pick<CalendarEvent, "rrule" | "exdates" | "series_id" | "original_date">;

/**
 * 할 일.
 * - due_date: 이름과 달리 "그 일을 하는 날" "YYYY-MM-DD" (없을 수도 있음)
 * - scheduled_start / scheduled_end: 예전 작업 시간. 화면에서는 더 쓰지 않지만 값은 보존한다.
 * - category_id / tag_ids: 할 일용(kind "task") 카테고리·태그
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
