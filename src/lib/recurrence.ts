/**
 * 반복 일정 규칙과 회차 펼치기.
 *
 * 규칙은 RFC 5545 RRULE 형식의 일부만 쓴다.
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY ; INTERVAL=n ; BYDAY=SU,MO,.. (매주만) ; UNTIL=YYYYMMDD ; COUNT=n
 * - UNTIL은 날짜만 쓰고, 그날 시작하는 회차까지 포함한다 (앱 규칙).
 * - 매월·매년은 시작일의 "일"(과 월)을 따른다. 그 날짜가 없는 달(31일, 2월 29일)은 건너뛴다.
 * - 매주의 BYDAY가 비어 있으면 시작일의 요일.
 * - COUNT는 빠진 회차(exdates)도 센다 (RFC와 같음).
 * - 모든 계산은 기기의 로컬 시간대 기준. 회차는 시작 시각(시:분)을 그대로 유지한다.
 */
import type { CalendarEvent } from "./types";
import { addDays, daysBetween, fromInputs, toDateInput } from "./date";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type RecurrenceRule = {
  freq: Freq;
  interval: number;
  /** 매주 반복 요일 (0=일 ~ 6=토) */
  byday: number[];
  /** 마지막 날짜 "YYYY-MM-DD" (그날 포함) */
  until: string | null;
  /** 총 횟수 */
  count: number | null;
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const FREQS: Freq[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

/** 화면에서 회차 펼치기를 멈추는 안전장치 (규칙이 이상해도 무한 루프 방지) */
const MAX_STEPS = 20_000;

/* ---------------- 규칙 문자열 ⇄ 객체 ---------------- */

export function parseRule(text: string | null | undefined): RecurrenceRule | null {
  if (!text) return null;
  const parts = new Map(
    text
      .replace(/^RRULE:/, "")
      .split(";")
      .map((p) => p.split("=") as [string, string]),
  );
  const freq = parts.get("FREQ") as Freq | undefined;
  if (!freq || !FREQS.includes(freq)) return null;
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1);
  const byday = (parts.get("BYDAY") ?? "")
    .split(",")
    .map((c) => DAY_CODES.indexOf(c))
    .filter((d) => d >= 0)
    .sort();
  const untilRaw = parts.get("UNTIL");
  const until =
    untilRaw && /^\d{8}/.test(untilRaw)
      ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`
      : null;
  const countRaw = Number(parts.get("COUNT"));
  const count = countRaw > 0 ? Math.floor(countRaw) : null;
  return { freq, interval, byday: freq === "WEEKLY" ? byday : [], until, count };
}

export function formatRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "WEEKLY" && rule.byday.length)
    parts.push(`BYDAY=${[...rule.byday].sort().map((d) => DAY_CODES[d]).join(",")}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replaceAll("-", "")}`);
  else if (rule.count) parts.push(`COUNT=${rule.count}`);
  return parts.join(";");
}

/* ---------------- 회차 펼치기 ---------------- */

export type Occurrence = {
  start: Date;
  end: Date;
  /** 회차 시작 날짜 "YYYY-MM-DD" (회차를 가리키는 키) */
  date: string;
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * 규칙에 따라 회차 시작 날짜를 순서대로 만든다 (빠진 회차 포함, COUNT·UNTIL 적용).
 * stopAfter 날짜를 넘으면 멈춘다.
 */
function* candidateDays(
  firstDay: Date,
  rule: RecurrenceRule,
  stopAfter: string,
): Generator<string> {
  const limit = rule.until && rule.until < stopAfter ? rule.until : stopAfter;
  const first = toDateInput(firstDay);
  let emitted = 0;
  const emit = (d: string) => {
    if (d > limit) return "stop";
    emitted += 1;
    return d;
  };
  const done = () => rule.count !== null && emitted >= rule.count;

  if (rule.freq === "DAILY") {
    for (let k = 0; k < MAX_STEPS && !done(); k++) {
      const r = emit(toDateInput(addDays(firstDay, k * rule.interval)));
      if (r === "stop") return;
      yield r;
    }
  } else if (rule.freq === "WEEKLY") {
    const days = rule.byday.length ? [...rule.byday].sort() : [firstDay.getDay()];
    const weekStart = addDays(firstDay, -firstDay.getDay()); // 한 주는 일요일 시작
    for (let w = 0; w < MAX_STEPS; w++) {
      const base = addDays(weekStart, w * 7 * rule.interval);
      for (const wd of days) {
        if (done()) return;
        const d = toDateInput(addDays(base, wd));
        if (d < first) continue;
        const r = emit(d);
        if (r === "stop") return;
        yield r;
      }
    }
  } else {
    const y0 = firstDay.getFullYear();
    const m0 = firstDay.getMonth();
    const day = firstDay.getDate();
    for (let k = 0; k < MAX_STEPS && !done(); k++) {
      const months = rule.freq === "MONTHLY" ? k * rule.interval : k * rule.interval * 12;
      const y = y0 + Math.floor((m0 + months) / 12);
      const m = (m0 + months) % 12;
      const pad = (n: number) => String(n).padStart(2, "0");
      // 그 날짜가 없는 달은 건너뜀 (이 경우 횟수도 세지 않음)
      if (day > daysInMonth(y, m)) {
        if (`${y}-${pad(m + 1)}-01` > limit) return;
        continue;
      }
      const r = emit(`${y}-${pad(m + 1)}-${pad(day)}`);
      if (r === "stop") return;
      yield r;
    }
  }
}

/** 회차 날짜 → 시작·끝 시각 (시작 시각과 길이는 원래 일정과 같음) */
function occurrenceAt(event: CalendarEvent, date: string): Occurrence {
  const s0 = new Date(event.start_at);
  const e0 = new Date(event.end_at);
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(y, m - 1, d, s0.getHours(), s0.getMinutes(), s0.getSeconds());
  const end = event.all_day
    ? addDays(start, Math.max(1, daysBetween(toDateInput(s0), toDateInput(e0))))
    : new Date(start.getTime() + (e0.getTime() - s0.getTime()));
  return { start, end, date };
}

/** 기간 [from, to) 과 겹치는 회차들 (빠진 회차 제외). 반복이 아니면 빈 배열. */
export function expandEvent(event: CalendarEvent, from: Date, to: Date): Occurrence[] {
  const rule = parseRule(event.rrule);
  if (!rule) return [];
  const excluded = new Set(event.exdates);
  const out: Occurrence[] = [];
  for (const date of candidateDays(new Date(event.start_at), rule, toDateInput(to))) {
    if (excluded.has(date)) continue;
    const occ = occurrenceAt(event, date);
    if (occ.start < to && occ.end > from) out.push(occ);
  }
  return out;
}

/** 특정 날짜에 시작하는 회차 (없으면 null) */
export function occurrenceOn(event: CalendarEvent, date: string): Occurrence | null {
  const rule = parseRule(event.rrule);
  if (!rule) return null;
  for (const d of candidateDays(new Date(event.start_at), rule, date)) {
    if (d === date) return occurrenceAt(event, date);
  }
  return null;
}

/** 첫 회차 날짜 (빠진 회차 포함 규칙상 첫 날) */
export function firstOccurrenceDate(event: CalendarEvent): string | null {
  const rule = parseRule(event.rrule);
  if (!rule) return null;
  const it = candidateDays(new Date(event.start_at), rule, "9999-12-31").next();
  return it.done ? null : it.value;
}

/** date 이전에 규칙상 몇 번 있었는지 (빠진 회차 포함) */
export function countBefore(event: CalendarEvent, date: string): number {
  const rule = parseRule(event.rrule);
  if (!rule) return 0;
  let n = 0;
  for (const d of candidateDays(new Date(event.start_at), rule, toDateInput(addDays(fromInputs(date), -1)))) {
    if (d < date) n += 1;
  }
  return n;
}

/** 매주 규칙의 요일을 dayDelta만큼 옮긴다 (일정을 다른 요일로 옮겼을 때) */
export function shiftRule(rule: RecurrenceRule, dayDelta: number): RecurrenceRule {
  if (rule.freq !== "WEEKLY" || dayDelta % 7 === 0) return rule;
  const shift = ((dayDelta % 7) + 7) % 7;
  return { ...rule, byday: [...new Set(rule.byday.map((d) => (d + shift) % 7))].sort() };
}

/* ---------------- 화면 표시 ---------------- */

/** 빠른 선택 항목 */
export type RepeatPreset = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

export function presetRule(preset: RepeatPreset, start: Date): RecurrenceRule | null {
  const base = { interval: 1, byday: [], until: null, count: null };
  switch (preset) {
    case "daily":
      return { ...base, freq: "DAILY" };
    case "weekly":
      return { ...base, freq: "WEEKLY", byday: [start.getDay()] };
    case "monthly":
      return { ...base, freq: "MONTHLY" };
    case "yearly":
      return { ...base, freq: "YEARLY" };
    default:
      return null;
  }
}

export function presetLabel(preset: RepeatPreset, start: Date): string {
  switch (preset) {
    case "none":
      return "반복 안 함";
    case "daily":
      return "매일";
    case "weekly":
      return `매주 ${DAY_NAMES[start.getDay()]}요일`;
    case "monthly":
      return `매월 ${start.getDate()}일`;
    case "yearly":
      return `매년 ${start.getMonth() + 1}월 ${start.getDate()}일`;
    case "custom":
      return "사용자 지정…";
  }
}

/** 저장된 규칙이 빠른 선택 중 하나와 같으면 그 이름, 아니면 custom */
export function presetOf(rule: RecurrenceRule | null, start: Date): RepeatPreset {
  if (!rule) return "none";
  if (rule.interval !== 1 || rule.until || rule.count) return "custom";
  if (rule.freq === "DAILY") return "daily";
  if (rule.freq === "MONTHLY") return "monthly";
  if (rule.freq === "YEARLY") return "yearly";
  const days = rule.byday.length ? rule.byday : [start.getDay()];
  return days.length === 1 && days[0] === start.getDay() ? "weekly" : "custom";
}

/** "매주 월·수요일, 2026년 12월 31일까지" 같은 설명 */
export function describeRule(rule: RecurrenceRule, start: Date): string {
  const n = rule.interval;
  let text: string;
  switch (rule.freq) {
    case "DAILY":
      text = n === 1 ? "매일" : `${n}일마다`;
      break;
    case "WEEKLY": {
      const days = (rule.byday.length ? rule.byday : [start.getDay()]).map((d) => DAY_NAMES[d]);
      text = `${n === 1 ? "매주" : `${n}주마다`} ${days.join("·")}요일`;
      break;
    }
    case "MONTHLY":
      text = `${n === 1 ? "매월" : `${n}개월마다`} ${start.getDate()}일`;
      break;
    case "YEARLY":
      text = `${n === 1 ? "매년" : `${n}년마다`} ${start.getMonth() + 1}월 ${start.getDate()}일`;
      break;
  }
  if (rule.until) {
    const u = fromInputs(rule.until);
    text += `, ${u.getFullYear()}년 ${u.getMonth() + 1}월 ${u.getDate()}일까지`;
  } else if (rule.count) {
    text += `, ${rule.count}회`;
  }
  return text;
}

export { DAY_NAMES };
