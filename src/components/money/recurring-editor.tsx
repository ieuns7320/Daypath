"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { newId, useStore } from "@/lib/data/store";
import { todayInput } from "@/lib/date";
import {
  MONEY_TYPE_LABEL,
  firstRecurringMonth,
  formatWon,
  monthKey,
  parseWon,
  recurringDayLabel,
  sortMoneyCategories,
} from "@/lib/money";
import { colorVar } from "@/lib/palette";
import type { MoneyRecurring, MoneyType } from "@/lib/types";
import { Chip } from "../editor/item-editor";
import { XIcon } from "../icons";

/**
 * 고정 지출·수입 창 (설정 › 가계부). 매달 N일(31 = 말일)에 자동으로 기록된다.
 * 고쳐도 이미 만든 기록은 그대로, 지워도 지금까지 기록은 남는다.
 */
export function RecurringEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { money_recurring, money_categories, saveMoneyRecurring, deleteMoneyRecurring } = useStore();
  const existing = id ? money_recurring.find((r) => r.id === id) : undefined;
  const today = todayInput();

  const [type, setType] = useState<MoneyType>(existing?.type ?? "expense");
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [day, setDay] = useState(existing?.day ?? Number(today.slice(8)));
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const categories = sortMoneyCategories(money_categories).filter((c) => c.type === type);
  const startsNextMonth = !existing && firstRecurringMonth(day, today) !== monthKey(today);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (id && !existing) {
    queueMicrotask(onClose);
    return null;
  }

  function changeType(next: MoneyType) {
    setType(next);
    if (categoryId && !money_categories.some((c) => c.id === categoryId && c.type === next)) setCategoryId(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (amount <= 0) return;
    const item: MoneyRecurring = {
      id: existing?.id ?? newId(),
      type,
      amount,
      category_id: categoryId,
      title: title.trim(),
      day,
      start_month: existing?.start_month ?? firstRecurringMonth(day, today),
      end_month: existing?.end_month ?? null,
      skipped: existing?.skipped ?? [],
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    void saveMoneyRecurring(item);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] md:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-xl md:max-w-md md:rounded-xl md:pb-0"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm font-medium text-fg-muted">{existing ? "고정 항목 수정" : "새 고정 항목"}</span>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-fg-muted hover:text-fg">
            <XIcon />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div role="radiogroup" aria-label="지출 또는 수입" className="inline-flex rounded-lg bg-bg-hover p-0.5">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => changeType(t)}
                className={`rounded-md px-5 py-1.5 text-sm ${type === t ? "bg-bg font-medium shadow-sm" : "text-fg-muted"}`}
              >
                {MONEY_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <div>
            <div
              className={`flex items-baseline gap-2 border-b pb-1.5 ${
                tried && amount <= 0 ? "border-danger" : "border-line focus-within:border-fg-muted"
              }`}
            >
              <span className="text-2xl font-semibold text-fg-faint">{type === "expense" ? "-" : "+"}</span>
              <input
                autoFocus={!existing}
                inputMode="numeric"
                value={amount ? formatWon(amount) : ""}
                onChange={(e) => setAmount(parseWon(e.target.value))}
                placeholder="0"
                aria-label="금액"
                className={`min-w-0 flex-1 bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-fg-faint ${
                  type === "income" ? "text-[var(--c-blue)]" : "text-danger"
                }`}
              />
              <span className="text-sm text-fg-muted">원</span>
            </div>
            {tried && amount <= 0 && <p className="mt-1 text-xs text-danger">금액을 입력해 주세요.</p>}
          </div>

          <div>
            <p className="mb-2 text-xs text-fg-faint">분류</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip selected={categoryId === null} onClick={() => setCategoryId(null)}>
                없음
              </Chip>
              {categories.map((c) => (
                <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                  <span className="size-2.5 rounded-[3px]" style={{ background: colorVar(c.color) }} />
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-fg-faint">내용</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "expense" ? "예: 월세" : "예: 월급"}
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none placeholder:text-fg-faint focus:border-fg-muted"
            />
          </div>

          {/* 매달 며칠 */}
          <div>
            <p className="mb-2 text-xs text-fg-faint">
              {recurringDayLabel(day)}
              {day >= 29 && day < 31 && " (그 날이 없는 달은 말일)"}
            </p>
            <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="매달 며칠">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={day === d}
                  onClick={() => setDay(d)}
                  className={`rounded-md py-1 text-sm tabular-nums ${
                    day === d ? "bg-accent font-medium text-accent-fg" : "text-fg-muted hover:bg-bg-hover"
                  }`}
                >
                  {d === 31 ? "말일" : d}
                </button>
              ))}
            </div>
            {startsNextMonth && (
              <p className="mt-2 text-xs text-fg-faint">이번 달 {day >= 31 ? "말일" : `${day}일`}은 지나서 다음 달부터 기록돼요.</p>
            )}
            {existing && <p className="mt-2 text-xs text-fg-faint">고쳐도 이미 기록된 내역은 그대로예요.</p>}
          </div>
        </div>

        {confirming && existing ? (
          <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs">
            <span className="min-w-0 flex-1 text-fg-muted">지울까요? 지금까지 기록은 남고, 앞으로 자동 기록만 멈춰요.</span>
            <button type="button" onClick={() => setConfirming(false)} className="shrink-0 rounded-md px-2 py-1 text-fg-muted hover:bg-bg-hover">
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                void deleteMoneyRecurring(existing.id);
                onClose();
              }}
              className="shrink-0 rounded-md bg-danger px-2 py-1 font-medium text-white hover:opacity-90"
            >
              삭제
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            {existing ? (
              <button type="button" onClick={() => setConfirming(true)} className="text-sm text-danger hover:opacity-80">
                삭제
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90">
              저장
            </button>
          </div>
        )}
      </form>
    </div>,
    document.body,
  );
}
