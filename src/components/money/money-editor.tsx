"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { newId, useStore } from "@/lib/data/store";
import { MONEY_TYPE_LABEL, formatWon, parseWon, sortMoneyCategories } from "@/lib/money";
import { colorVar } from "@/lib/palette";
import type { MoneyEntry, MoneyType } from "@/lib/types";
import { Chip } from "../editor/item-editor";
import { XIcon } from "../icons";
import { DatePicker } from "../pickers";

/** 새 기록(그날 날짜) 또는 기존 기록 수정 */
export type MoneyTarget = { kind: "new"; date: string; type?: MoneyType } | { kind: "entry"; id: string };

/**
 * 가계부 기록 창. 데스크톱은 가운데 팝업, 모바일은 아래에서 올라오는 시트.
 *   [지출 | 수입]  금액(숫자 키패드, 쉼표 자동)  분류  내용  날짜
 */
export function MoneyEditor({ target, onClose }: { target: MoneyTarget; onClose: () => void }) {
  const { money_entries, money_categories, saveMoneyEntry, deleteMoneyEntry } = useStore();
  const existing = target.kind === "entry" ? money_entries.find((e) => e.id === target.id) : undefined;
  const isNew = !existing;

  const [type, setType] = useState<MoneyType>(existing?.type ?? (target.kind === "new" ? target.type : undefined) ?? "expense");
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.date ?? (target.kind === "new" ? target.date : ""));
  const [tried, setTried] = useState(false);

  const categories = sortMoneyCategories(money_categories).filter((c) => c.type === type);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) amountRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isNew]);

  // 수정하려던 기록이 다른 기기에서 지워졌으면 닫는다
  if (target.kind === "entry" && !existing) {
    queueMicrotask(onClose);
    return null;
  }

  function changeType(next: MoneyType) {
    setType(next);
    // 분류는 지출·수입이 따로라서, 다른 쪽 분류였으면 비운다
    if (categoryId && !money_categories.some((c) => c.id === categoryId && c.type === next))
      setCategoryId(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (amount <= 0) return amountRef.current?.focus();
    const entry: MoneyEntry = {
      id: existing?.id ?? newId(),
      date,
      type,
      amount,
      category_id: categoryId,
      title: title.trim(),
      recurring_id: existing?.recurring_id ?? null,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    void saveMoneyEntry(entry);
    onClose();
  }

  function remove() {
    if (!existing) return;
    void deleteMoneyEntry(existing.id);
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
          <span className="text-sm font-medium text-fg-muted">{isNew ? "새 기록" : "기록 수정"}</span>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-fg-muted hover:text-fg">
            <XIcon />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* 지출 | 수입 */}
          <div role="radiogroup" aria-label="지출 또는 수입" className="inline-flex rounded-lg bg-bg-hover p-0.5">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => changeType(t)}
                className={`rounded-md px-5 py-1.5 text-sm ${
                  type === t ? "bg-bg font-medium shadow-sm" : "text-fg-muted"
                }`}
              >
                {MONEY_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* 금액 */}
          <div>
            <div
              className={`flex items-baseline gap-2 border-b pb-1.5 ${
                tried && amount <= 0 ? "border-danger" : "border-line focus-within:border-fg-muted"
              }`}
            >
              <span className="text-2xl font-semibold text-fg-faint">{type === "expense" ? "-" : "+"}</span>
              <input
                ref={amountRef}
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

          {/* 분류 */}
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

          {/* 내용 */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-fg-faint">내용</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "expense" ? "예: 점심" : "예: 11월 월급"}
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none placeholder:text-fg-faint focus:border-fg-muted"
            />
          </div>

          {/* 날짜 */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-fg-faint">날짜</span>
            <DatePicker value={date} onChange={setDate} ariaLabel="날짜" />
          </div>

          {existing?.recurring_id && (
            <p className="text-xs text-fg-faint">고정 항목에서 자동으로 만든 기록이에요. 여기서 고쳐도 다음 달에는 영향이 없어요.</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          {!isNew ? (
            <button type="button" onClick={remove} className="text-sm text-danger hover:opacity-80">
              삭제
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            저장
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
