/*
 * 가계부 계산 도우미 (5단계).
 * 금액은 원 단위 양수 정수, 지출·수입은 type으로 구분한다.
 */

import type { ColorKey } from "./palette";
import type { MoneyBudget, MoneyCategory, MoneyEntry, MoneyType } from "./types";

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
