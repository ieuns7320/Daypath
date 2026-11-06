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

/** 지금 이후 가장 가까운 정각 */
export function nextHour(from = new Date()): Date {
  const r = new Date(from);
  r.setMinutes(0, 0, 0);
  r.setHours(r.getHours() + 1);
  return r;
}
