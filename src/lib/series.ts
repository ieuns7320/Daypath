/**
 * 반복 일정의 한 회차를 고치거나 지울 때 무엇을 저장·삭제할지 계산한다.
 *
 * 범위(scope)
 * - this:      그 회차만. 원래 반복에서 그날을 빼고(exdates), 고친 회차를 따로 저장(series_id·original_date).
 * - following: 그 회차부터. 원래 반복은 전날까지로 끊고, 그날부터 고친 내용으로 새 반복을 만든다.
 *              그날 이후에 따로 떼어 둔 회차는 지운다.
 * - all:       반복 전체. 회차를 옮긴 만큼 반복 전체(시작일·요일·빠진 날짜)를 옮긴다.
 *
 * 결과는 화면(낙관적 업데이트)과 저장소에 그대로 적용한다.
 */
import { addDays, daysBetween, fromInputs, toDateInput } from "./date";
import {
  countBefore,
  firstOccurrenceDate,
  formatRule,
  parseRule,
  shiftRule,
} from "./recurrence";
import type { CalendarEvent } from "./types";

export type Scope = "this" | "following" | "all";

export type EventChanges = { upserts: CalendarEvent[]; removes: string[] };

const shiftDate = (date: string, days: number) => toDateInput(addDays(fromInputs(date), days));

/** 시각(시:분)은 from에서, 날짜는 day에서 가져와 합친다 */
function onDay(day: Date, from: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
  );
}

/** 끝 시각: 종일이면 날짜 수, 아니면 길이(ms)를 유지 */
function endFor(start: Date, refStart: Date, refEnd: Date, allDay: boolean): Date {
  if (allDay) return addDays(start, Math.max(1, daysBetween(toDateInput(refStart), toDateInput(refEnd))));
  return new Date(start.getTime() + (refEnd.getTime() - refStart.getTime()));
}

/** 반복을 date 전날까지로 끊은 규칙 (COUNT 규칙이면 앞쪽 횟수로) */
function truncatedRule(series: CalendarEvent, date: string): string | null {
  const rule = parseRule(series.rrule);
  if (!rule) return null;
  if (rule.count) return formatRule({ ...rule, count: countBefore(series, date) });
  return formatRule({ ...rule, until: shiftDate(date, -1), count: null });
}

const childrenOf = (events: CalendarEvent[], seriesId: string) =>
  events.filter((e) => e.series_id === seriesId);

/**
 * 회차 수정.
 * @param next 고친 회차 (id는 반복 일정 id, start/end는 그 회차의 새 시각, rrule은 편집 창의 규칙)
 */
export function updateOccurrence(
  events: CalendarEvent[],
  series: CalendarEvent,
  occDate: string,
  scope: Scope,
  next: CalendarEvent,
  newId: () => string,
): EventChanges {
  const newStart = new Date(next.start_at);
  const newEnd = new Date(next.end_at);
  const dayDelta = daysBetween(occDate, toDateInput(newStart));
  const ruleUnchanged = next.rrule === series.rrule;

  if (scope === "this") {
    const detached: CalendarEvent = {
      ...next,
      id: newId(),
      rrule: null,
      exdates: [],
      series_id: series.id,
      original_date: occDate,
    };
    return {
      upserts: [{ ...series, exdates: [...new Set([...series.exdates, occDate])] }, detached],
      removes: [],
    };
  }

  const first = firstOccurrenceDate(series);
  if (scope === "following" && first !== null && occDate > first) {
    const rule = parseRule(series.rrule);
    let nextRule = next.rrule;
    if (ruleUnchanged && rule) {
      // 같은 규칙으로 이어가기: 횟수 규칙이면 남은 횟수, 요일은 옮긴 만큼
      const remaining = rule.count ? Math.max(1, rule.count - countBefore(series, occDate)) : null;
      nextRule = formatRule(shiftRule({ ...rule, count: remaining }, dayDelta));
    }
    const continued: CalendarEvent = {
      ...next,
      id: newId(),
      rrule: nextRule,
      exdates: series.exdates.filter((d) => d > occDate).map((d) => shiftDate(d, dayDelta)),
      series_id: null,
      original_date: null,
    };
    const later = childrenOf(events, series.id).filter((c) => (c.original_date ?? "") >= occDate);
    return {
      upserts: [{ ...series, rrule: truncatedRule(series, occDate) }, continued],
      removes: later.map((c) => c.id),
    };
  }

  // 전체 (또는 첫 회차부터 "이후 모든 일정")
  const children = childrenOf(events, series.id);
  if (!next.rrule) {
    // 반복을 없앴다면: 고친 회차 하나만 남긴다
    return {
      upserts: [{ ...next, id: series.id, exdates: [], series_id: null, original_date: null }],
      removes: children.map((c) => c.id),
    };
  }
  const seriesStart = new Date(series.start_at);
  const start = onDay(addDays(seriesStart, dayDelta), newStart);
  const end = endFor(start, newStart, newEnd, next.all_day);
  const rule = parseRule(next.rrule);
  const updated: CalendarEvent = {
    ...next,
    id: series.id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    rrule: ruleUnchanged && rule ? formatRule(shiftRule(rule, dayDelta)) : next.rrule,
    exdates: series.exdates.map((d) => shiftDate(d, dayDelta)),
    series_id: null,
    original_date: null,
  };
  const movedChildren =
    dayDelta === 0
      ? []
      : children.map((c) => ({
          ...c,
          original_date: c.original_date ? shiftDate(c.original_date, dayDelta) : null,
        }));
  return { upserts: [updated, ...movedChildren], removes: [] };
}

/** 회차 삭제 */
export function deleteOccurrence(
  events: CalendarEvent[],
  series: CalendarEvent,
  occDate: string,
  scope: Scope,
): EventChanges {
  const children = childrenOf(events, series.id);
  if (scope === "this") {
    return {
      upserts: [{ ...series, exdates: [...new Set([...series.exdates, occDate])] }],
      removes: [],
    };
  }
  const first = firstOccurrenceDate(series);
  if (scope === "following" && first !== null && occDate > first) {
    const later = children.filter((c) => (c.original_date ?? "") >= occDate);
    return {
      upserts: [{ ...series, rrule: truncatedRule(series, occDate) }],
      removes: later.map((c) => c.id),
    };
  }
  // 떼어 낸 회차를 먼저, 반복 일정을 나중에 지운다
  return { upserts: [], removes: [...children.map((c) => c.id), series.id] };
}
