"use client";

import { useEffect, useRef } from "react";
import { newId, useStore } from "@/lib/data/store";
import { DEFAULT_MONEY_CATEGORIES } from "@/lib/money";

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
