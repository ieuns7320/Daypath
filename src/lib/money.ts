/*
 * 가계부 계산 도우미 (5단계).
 * 금액은 원 단위 양수 정수, 지출·수입은 type으로 구분한다.
 */

import type { ColorKey } from "./palette";
import { toDateInput } from "./date";
import type { MoneyBudget, MoneyCategory, MoneyEntry, MoneyRecurring, MoneyType } from "./types";

/** 처음 가계부를 열었을 때 넣는 기본 분류 */
export const DEFAULT_MONEY_CATEGORIES: { name: string; color: ColorKey; type: MoneyType }[] = [
  { name: "식비", color: "orange", type: "expense" },
  { name: "카페", color: "amber", type: "expense" },
  { name: "교통", color: "blue", type: "expense" },
  { name: "주거", color: "teal", type: "expense" },
  { name: "통신", color: "indigo", type: "expense" },
  { name: "쇼핑", color: "pink", type: "expense" },
  { name: "의료", color: "red", type: "expense" },
  { name: "문화", color: "purple", type: "expense" },
  { name: "기타", color: "gray", type: "expense" },
  { name: "월급", color: "green", type: "income" },
  { name: "기타", color: "gray", type: "income" },
];

export const MONEY_TYPE_LABEL: Record<MoneyType, string> = { expense: "지출", income: "수입" };

/** 23500 → "23,500" */
export function formatWon(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/** 지출은 "-23,500", 수입은 "+3,200,000" */
export function signedWon(n: number, type: MoneyType): string {
  return `${type === "expense" ? "-" : "+"}${formatWon(n)}`;
}

/** 소수 한 자리까지, 0이면 뗀다: 2.4 / 65 */
function oneDecimal(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * 달력 칸용 줄인 금액: 800 → "800", 9000 → "9천", 9500 → "9.5천", 23500 → "2.4만",
 * 650000 → "65만", 3200000 → "320만", 120000000 → "1.2억"
 */
export function shortWon(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${oneDecimal(n / 1000)}천`;
  if (n < 100_000_000) {
    const man = n / 10_000;
    return man < 100 ? `${oneDecimal(man)}만` : `${Math.round(man)}만`;
  }
  return `${oneDecimal(n / 100_000_000)}억`;
}

/** "YYYY-MM-DD" → 그 달 1일 "YYYY-MM-01" */
export const monthKey = (date: string) => date.slice(0, 8) + "01";

/** 그 달에 적용되는 예산: month가 그 달 이하인 기록 중 가장 최근 것. 없거나 null이면 예산 없음 */
export function budgetFor(month: string, budgets: MoneyBudget[]): MoneyBudget | null {
  let best: MoneyBudget | null = null;
  for (const b of budgets) {
    if (b.month > month) continue;
    if (!best || b.month > best.month || (b.month === best.month && b.created_at > best.created_at))
      best = b;
  }
  return best;
}

export type DaySum = { expense: number; income: number };

/** 날짜별 지출·수입 합계 */
export function daySums(entries: MoneyEntry[]): Map<string, DaySum> {
  const map = new Map<string, DaySum>();
  for (const e of entries) {
    const s = map.get(e.date) ?? { expense: 0, income: 0 };
    s[e.type] += e.amount;
    map.set(e.date, s);
  }
  return map;
}

/** 그 달(month = "YYYY-MM-01")의 지출·수입 합계 */
export function monthSum(entries: MoneyEntry[], month: string): DaySum {
  const sum = { expense: 0, income: 0 };
  for (const e of entries) if (monthKey(e.date) === month) sum[e.type] += e.amount;
  return sum;
}

/** 분류 정렬: 지출 먼저, 그 안에서 순서 */
export function sortMoneyCategories(list: MoneyCategory[]): MoneyCategory[] {
  return [...list].sort(
    (a, b) => (a.type === b.type ? a.sort_order - b.sort_order : a.type === "expense" ? -1 : 1),
  );
}

/** 금액 입력 "12,3a4" → 1234 (숫자만, 상한 1조 미만) */
export function parseWon(text: string): number {
  const digits = text.replace(/[^0-9]/g, "").slice(0, 12);
  return digits ? Number(digits) : 0;
}

/* ---------- 고정 지출·수입 (5b) ---------- */

/** 매달 N일 → 그 달의 날짜. 그 달에 N일이 없으면(31일, 2월 30일 등) 말일 */
export function recurringDate(day: number, month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const last = new Date(y, m + 1, 0).getDate();
  return toDateInput(new Date(y, m, Math.min(day, last)));
}

/** "매달 25일", 31이면 "매달 말일" */
export const recurringDayLabel = (day: number) => (day >= 31 ? "매달 말일" : `매달 ${day}일`);

function addMonths(month: string, n: number): string {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
  return toDateInput(d);
}

/**
 * 고정 항목 자동 기록의 id. 같은 항목·같은 달이면 어느 기기에서 만들어도 같은 id라
 * 두 기기가 동시에 기록해도 하나만 남는다.
 */
export function recurringEntryId(ruleId: string, month: string): string {
  // cyrb128: 짧은 문자열을 128비트로 섞는 간단한 해시
  const str = `${ruleId}:${month}`;
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("");
  // UUID 모양(버전 4·변형 비트 맞춤)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** 이 고정 항목이 그 달에 쓰이는지 (시작·끝 달 안이고, 지운 달이 아님) */
function activeIn(rule: MoneyRecurring, month: string): boolean {
  if (month < rule.start_month) return false;
  if (rule.end_month && month > rule.end_month) return false;
  return !rule.skipped.some((d) => monthKey(d) === month);
}

/** 고정 항목별로 기록이 이미 있는 달 */
function recordedMonths(entries: MoneyEntry[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.recurring_id) continue;
    const set = map.get(e.recurring_id) ?? new Set<string>();
    set.add(monthKey(e.date));
    map.set(e.recurring_id, set);
  }
  return map;
}

function entryFrom(rule: MoneyRecurring, month: string, id: string): MoneyEntry {
  return {
    id,
    date: recurringDate(rule.day, month),
    type: rule.type,
    amount: rule.amount,
    category_id: rule.category_id,
    title: rule.title,
    recurring_id: rule.id,
    created_at: new Date().toISOString(),
  };
}

/**
 * 오늘까지 날이 왔는데 아직 기록이 없는 고정 항목 → 새로 만들 기록.
 * 한 항목은 한 달에 하나만 (그 달에 이 항목 기록이 이미 있거나 지웠으면 만들지 않음).
 */
export function dueRecurringEntries(
  rules: MoneyRecurring[],
  entries: MoneyEntry[],
  today: string,
): MoneyEntry[] {
  const recorded = recordedMonths(entries);
  const out: MoneyEntry[] = [];
  const thisMonth = monthKey(today);
  for (const r of rules) {
    // 오래전 시작이어도 최대 24달까지만 거슬러 채운다
    let month = r.start_month < addMonths(thisMonth, -24) ? addMonths(thisMonth, -24) : r.start_month;
    for (; month <= thisMonth; month = addMonths(month, 1)) {
      if (!activeIn(r, month) || recorded.get(r.id)?.has(month)) continue;
      if (recurringDate(r.day, month) > today) continue;
      out.push(entryFrom(r, month, recurringEntryId(r.id, month)));
    }
  }
  return out;
}

/** 그 달에 아직 날이 오지 않은 고정 항목 → 흐린 "예정" (합계에는 넣지 않는다) */
export type PlannedEntry = MoneyEntry & { planned: true };

export function plannedEntries(
  rules: MoneyRecurring[],
  entries: MoneyEntry[],
  month: string,
  today: string,
): PlannedEntry[] {
  const recorded = recordedMonths(entries);
  const out: PlannedEntry[] = [];
  for (const r of rules) {
    if (!activeIn(r, month) || recorded.get(r.id)?.has(month)) continue;
    if (recurringDate(r.day, month) <= today) continue;
    out.push({ ...entryFrom(r, month, `planned:${r.id}:${month}`), planned: true });
  }
  return out;
}

/** 새 고정 항목의 시작 달: 이번 달 그날이 이미 지났으면 다음 달부터 */
export function firstRecurringMonth(day: number, today: string): string {
  const thisMonth = monthKey(today);
  return recurringDate(day, thisMonth) < today ? addMonths(thisMonth, 1) : thisMonth;
}
