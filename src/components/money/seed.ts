"use client";

import { useEffect, useRef } from "react";
import { newId, useStore } from "@/lib/data/store";
import { todayInput } from "@/lib/date";
import { DEFAULT_MONEY_CATEGORIES, dueRecurringEntries } from "@/lib/money";

/** 가계부 분류가 하나도 없으면 기본 분류를 한 번 넣는다 (가계부 탭·설정 어느 쪽을 먼저 열어도) */
export function useMoneyCategorySeed() {
  const store = useStore();
  const { ready, moneyAvailable, money_categories } = store;
  const seeded = useRef(false);
  useEffect(() => {
    if (!ready || !moneyAvailable || seeded.current || money_categories.length > 0) return;
    seeded.current = true;
    void store.saveMoneyCategories(
      DEFAULT_MONEY_CATEGORIES.map((c, i) => ({ id: newId(), ...c, sort_order: i })),
    );
  }, [ready, moneyAvailable, money_categories.length, store]);
}

/**
 * 고정 지출·수입: 날이 왔는데 기록이 없으면 만든다 (가계부 탭을 열 때).
 * id가 항목·달로 정해져 있어 두 기기가 동시에 만들어도 하나만 남는다.
 */
export function useRecurringSync() {
  const { ready, moneyAvailable, money_recurring, money_entries, saveMoneyEntries } = useStore();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!ready || !moneyAvailable || money_recurring.length === 0) return;
    // 한 번 시도한 id는 다시 보내지 않는다(저장 실패 시 무한 반복 방지)
    const due = dueRecurringEntries(money_recurring, money_entries, todayInput()).filter(
      (e) => !tried.current.has(e.id),
    );
    if (due.length === 0) return;
    for (const e of due) tried.current.add(e.id);
    void saveMoneyEntries(due);
  }, [ready, moneyAvailable, money_recurring, money_entries, saveMoneyEntries]);
}
