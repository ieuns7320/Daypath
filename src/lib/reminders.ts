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

export function reminderLabel(minutes: number, allDay: boolean, alldayTime: string): string {
  if (allDay) return minutes === 0 ? `당일 ${alldayTime}` : `전날 ${alldayTime}`;
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
  // 알림 시점이 회차보다 최대 하루(+여유) 앞설 수 있으므로 조금 넓게 펼친다
  const maxLead = 2 * 1440;
  for (const event of events) {
    if (!event.reminders?.length) continue;
    for (const start of startsOf(event, now, addDays(until, maxLead / 1440))) {
      const day = toDateInput(start);
      const url = "/calendar";
      for (const m of event.reminders) {
        if (event.all_day) {
          const at = new Date(fromInputs(day, settings.allday_time).getTime() - m * 60_000);
          push(at, event.title, m === 0 ? "오늘 종일 일정" : "내일 종일 일정", url);
        } else {
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
