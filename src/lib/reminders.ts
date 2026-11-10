import { addDays, fromInputs, timeLabel, toDateInput } from "./date";
import { expandEvent } from "./recurrence";
import type { CalendarEvent, NotifySettings, Task } from "./types";

/**
 * 알림 예약 계산.
 * 앱이 지금부터 HORIZON_DAYS 일 안에 보낼 알림을 모두 계산해 서버(push_queue)에 통째로 넘긴다.
 * 서버는 시각만 보고 보낸다 (반복 일정 계산은 여기서만).
 */

export const HORIZON_DAYS = 30;
/** 한 번에 예약하는 최대 개수 (서버도 2000개로 자른다) */
const MAX_ITEMS = 1500;

export type QueueItem = { send_at: string; title: string; body: string; url: string };

/* ---------- 편집 창·설정의 선택지 ---------- */

/** 시간 일정 알림 선택지 (분 전) */
export const TIMED_OPTIONS = [0, 5, 10, 30, 60, 1440] as const;
/** 종일 일정 알림 선택지: 당일 / 전날 (종일 알림 시각 기준) */
export const ALLDAY_OPTIONS = [0, 1440] as const;
/** 새 종일 일정의 기본 알림: 당일 */
export const ALLDAY_DEFAULT = [0];

/*
 * 종일 일정의 "직접 정한" 알림 (2026-11-10): 음수로 저장해 기존 값(0 당일, 1440 전날)과 겹치지 않게 한다.
 *   값 = -(N일 전 × 1440 + 그날 몇 분째) - 1   예) 당일 07:30 → -451, 전날 21:00 → -2701
 * DB 칸(integer[])은 그대로라 마이그레이션이 필요 없다.
 */
/** 직접 정하기에서 고를 수 있는 "며칠 전" */
export const ALLDAY_CUSTOM_DAYS = [0, 1, 2, 3, 7] as const;

export const isAlldayCustom = (v: number) => v < 0;

export function encodeAlldayCustom(daysBefore: number, time: string): number {
  const [h, m] = time.split(":").map(Number);
  return -(daysBefore * 1440 + h * 60 + m) - 1;
}

export function decodeAlldayCustom(v: number): { daysBefore: number; time: string } {
  const x = -v - 1;
  const minute = x % 1440;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { daysBefore: Math.floor(x / 1440), time: `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}` };
}

/** 당일 / 전날 / N일 전 */
export const daysBeforeLabel = (n: number) => (n === 0 ? "당일" : n === 1 ? "전날" : `${n}일 전`);

/**
 * 종일 일정 알림 값 → (며칠 전, 시각). 기본 선택지(0·1440)는 설정의 종일 알림 시각을 따른다.
 * 같은 시점인지 비교할 때도 쓴다.
 */
export function alldayWhen(v: number, alldayTime: string): { daysBefore: number; time: string } {
  if (isAlldayCustom(v)) return decodeAlldayCustom(v);
  return { daysBefore: Math.round(v / 1440), time: alldayTime };
}

/** 직접 정한 알림 정렬: 먼저 울리는 것부터 */
export function sortAlldayCustom(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function reminderLabel(minutes: number, allDay: boolean, alldayTime: string): string {
  if (allDay) {
    const { daysBefore, time } = alldayWhen(minutes, alldayTime);
    return `${daysBeforeLabel(daysBefore)} ${time}`;
  }
  if (minutes === 0) return "정시";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${minutes / 60}시간 전`;
  return `${minutes / 1440}일 전`;
}

/** "10분 뒤 · 14:30" 같은 알림 본문 앞부분 */
function leadText(minutes: number): string {
  if (minutes === 0) return "지금 시작";
  if (minutes < 60) return `${minutes}분 뒤`;
  if (minutes < 1440) return `${minutes / 60}시간 뒤`;
  return minutes === 1440 ? "내일" : `${minutes / 1440}일 뒤`;
}

/* ---------- 계산 ---------- */

/** 일정 한 회차의 시작 시각들 (반복이 아니면 그 일정 자체) */
function startsOf(event: CalendarEvent, from: Date, to: Date): Date[] {
  if (event.rrule) return expandEvent(event, from, to).map((o) => o.start);
  const start = new Date(event.start_at);
  return [start];
}

export function buildQueue(
  events: CalendarEvent[],
  tasks: Task[],
  settings: NotifySettings,
  now = new Date(),
): QueueItem[] {
  const until = addDays(now, HORIZON_DAYS);
  const items: QueueItem[] = [];
  const push = (at: Date, title: string, body: string, url: string) => {
    if (at > now && at <= until) items.push({ send_at: at.toISOString(), title, body, url });
  };

  /* 일정 */
  // 알림 시점이 회차보다 최대 7일(직접 정한 종일 알림, +여유) 앞설 수 있으므로 넓게 펼친다
  const maxLead = 8 * 1440;
  for (const event of events) {
    if (!event.reminders?.length) continue;
    for (const start of startsOf(event, now, addDays(until, maxLead / 1440))) {
      const day = toDateInput(start);
      const url = "/calendar";
      for (const m of event.reminders) {
        if (event.all_day) {
          const { daysBefore, time } = alldayWhen(m, settings.allday_time);
          const at = fromInputs(toDateInput(addDays(fromInputs(day), -daysBefore)), time);
          const when = daysBefore === 0 ? "오늘" : daysBefore === 1 ? "내일" : `${daysBefore}일 뒤`;
          push(at, event.title, `${when} 종일 일정`, url);
        } else if (m >= 0) {
          // 음수(종일용 직접 정한 값)는 시간 일정에서 무시
          const at = new Date(start.getTime() - m * 60_000);
          push(at, event.title, `${leadText(m)} · ${timeLabel(start.toISOString())}`, url);
        }
      }
    }
  }

  /* 할 일: 하는 날 아침 한 번, 그날 할 일을 묶어서 */
  if (settings.task_digest) {
    const byDay = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.done || !t.due_date) continue;
      const list = byDay.get(t.due_date) ?? [];
      list.push(t);
      byDay.set(t.due_date, list);
    }
    for (const [day, list] of byDay) {
      const at = fromInputs(day, settings.task_time);
      const names = list.map((t) => t.title);
      const body = names.slice(0, 3).join(", ") + (names.length > 3 ? ` 외 ${names.length - 3}개` : "");
      push(at, `오늘 할 일 ${list.length}개`, body, "/todos");
    }
  }

  items.sort((a, b) => a.send_at.localeCompare(b.send_at));
  return items.slice(0, MAX_ITEMS);
}
