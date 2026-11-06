/** 날짜 계산 도우미. 모두 기기의 로컬 시간대 기준. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "YYYY-MM-DD" (input[type=date] 값) */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date → "HH:mm" (input[type=time] 값) */
export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" + "HH:mm" → Date */
export function fromInputs(date: string, time = "00:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 오늘 "YYYY-MM-DD" */
export function todayInput(): string {
  return toDateInput(new Date());
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "YYYY-MM-DD" 사이의 날짜 차이 (b - a, 일 단위) */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromInputs(b).getTime() - fromInputs(a).getTime()) / 86_400_000);
}

/** 마감일 표시: 오늘 / 내일 / 어제 / 11월 7일 (토) / 2027년 1월 3일 (일) */
export function dueLabel(due: string, today = todayInput()): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  const d = fromInputs(due);
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  return sameYear ? md : `${d.getFullYear()}년 ${md}`;
}

/** 이번 주 토요일 "YYYY-MM-DD" (한 주는 일요일 시작) */
export function endOfWeekInput(today = todayInput()): string {
  const d = fromInputs(today);
  return toDateInput(addDays(d, 6 - d.getDay()));
}

/** "14:30" 처럼 24시간 표기 */
export function timeLabel(iso: string): string {
  return toTimeInput(new Date(iso));
}

/** 지금 이후 가장 가까운 정각 */
export function nextHour(from = new Date()): Date {
  const r = new Date(from);
  r.setMinutes(0, 0, 0);
  r.setHours(r.getHours() + 1);
  return r;
}
