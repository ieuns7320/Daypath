"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { newId, useStore } from "@/lib/data/store";
import {
  MONEY_TYPE_LABEL,
  formatWon,
  monthKey,
  parseWon,
  recurringDate,
  recurringDayLabel,
  recurringEntryId,
  sortMoneyCategories,
} from "@/lib/money";
import { colorVar } from "@/lib/palette";
import type { MoneyEntry, MoneyRecurring, MoneyType } from "@/lib/types";
import { Chip } from "../editor/item-editor";
import { XIcon } from "../icons";
import { DatePicker } from "../pickers";

/** 새 기록(그날 날짜), 기존 기록 수정, 또는 아직 날이 안 온 고정 항목(예정) */
export type MoneyTarget =
  | { kind: "new"; date: string; type?: MoneyType }
  | { kind: "entry"; id: string }
  | { kind: "planned"; ruleId: string; month: string };

/**
 * 가계부 기록 창. 데스크톱은 가운데 팝업, 모바일은 아래에서 올라오는 시트.
 *   [지출 | 수입]  금액(숫자 키패드, 쉼표 자동)  분류  내용  날짜
 */
export function MoneyEditor({ target, onClose }: { target: MoneyTarget; onClose: () => void }) {
  const { money_entries, money_categories, money_recurring, saveMoneyEntry, deleteMoneyEntry, saveMoneyRecurring } =
    useStore();
  const existing = target.kind === "entry" ? money_entries.find((e) => e.id === target.id) : undefined;
  const ruleId = target.kind === "planned" ? target.ruleId : existing?.recurring_id;
  const rule = ruleId ? money_recurring.find((r) => r.id === ruleId) : undefined;
  // 예정 항목은 고정 항목 값으로 채운다
  const base: Partial<MoneyEntry> =
    existing ??
    (target.kind === "planned" && rule
      ? {
          type: rule.type,
          amount: rule.amount,
          category_id: rule.category_id,
          title: rule.title,
          date: recurringDate(rule.day, target.month),
        }
      : {});
  const isPlanned = target.kind === "planned";
  const isNew = !existing && !isPlanned;
  const origDate = base.date;

  const [type, setType] = useState<MoneyType>(base.type ?? (target.kind === "new" ? target.type : undefined) ?? "expense");
  const [amount, setAmount] = useState(base.amount ?? 0);
  const [categoryId, setCategoryId] = useState<string | null>(base.category_id ?? null);
  const [title, setTitle] = useState(base.title ?? "");
  const [date, setDate] = useState(base.date ?? (target.kind === "new" ? target.date : ""));
  const [repeat, setRepeat] = useState(false);
  const [tried, setTried] = useState(false);
  // 매달 반복은 아직 고정 항목에 연결되지 않은 기록에서만 고른다
  const canRepeat = !ruleId;

  const categories = sortMoneyCategories(money_categories).filter((c) => c.type === type);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) amountRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isNew]);

  // 수정하려던 기록·고정 항목이 다른 기기에서 지워졌으면 닫는다
  if ((target.kind === "entry" && !existing) || (isPlanned && !rule)) {
    queueMicrotask(onClose);
    return null;
  }

  function changeType(next: MoneyType) {
    setType(next);
    // 분류는 지출·수입이 따로라서, 다른 쪽 분류였으면 비운다
    if (categoryId && !money_categories.some((c) => c.id === categoryId && c.type === next))
      setCategoryId(null);
  }

  /** 고정 항목의 그 달 기록을 다시 만들지 않게 표시 */
  const skip = (r: MoneyRecurring, d: string) =>
    saveMoneyRecurring({ ...r, skipped: [...r.skipped.filter((x) => monthKey(x) !== monthKey(d)), d] });

  async function save() {
    let recurringId = ruleId ?? null;
    let id = existing?.id ?? newId();
    if (repeat && canRepeat) {
      // 이 기록을 첫 회로 하는 고정 항목을 만든다 (그날 날짜의 일 = 매달 N일)
      const r: MoneyRecurring = {
        id: newId(),
        type,
        amount,
        category_id: categoryId,
        title: title.trim(),
        day: Number(date.slice(8)),
        start_month: monthKey(date),
        end_month: null,
        skipped: [],
        created_at: new Date().toISOString(),
      };
      await saveMoneyRecurring(r);
      recurringId = r.id;
      if (!existing) id = recurringEntryId(r.id, monthKey(date));
    } else if (isPlanned && rule) {
      // 예정 항목을 미리 기록: 자동 기록과 같은 id라 그날 다시 생기지 않는다
      id = recurringEntryId(rule.id, monthKey(origDate!));
    }
    // 고정 기록을 다른 달로 옮기면, 원래 달은 다시 만들지 않는다
    if (rule && origDate && monthKey(origDate) !== monthKey(date)) await skip(rule, origDate);
    await saveMoneyEntry({
      id,
      date,
      type,
      amount,
      category_id: categoryId,
      title: title.trim(),
      recurring_id: recurringId,
      created_at: existing?.created_at ?? new Date().toISOString(),
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (amount <= 0) return amountRef.current?.focus();
    void save();
    onClose();
  }

  function remove() {
    // 고정 항목에서 온 기록·예정을 지우면 그 달은 건너뛴다
    if (rule && origDate) void skip(rule, origDate);
    if (existing) void deleteMoneyEntry(existing.id);
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
          <span className="text-sm font-medium text-fg-muted">
            {isPlanned ? "예정된 고정 기록" : isNew ? "새 기록" : "기록 수정"}
          </span>
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

          {canRepeat && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              매달 반복
              {repeat && date && (
                <span className="text-xs text-fg-faint">
                  {recurringDayLabel(Number(date.slice(8)))}에 자동으로 기록돼요
                </span>
              )}
            </label>
          )}

          {rule && (
            <p className="text-xs leading-5 text-fg-faint">
              ↻ {recurringDayLabel(rule.day)} 고정 항목
              {isPlanned
                ? "이에요. 저장하면 지금 기록되고, 그날 다시 생기지 않아요."
                : "에서 만든 기록이에요. 여기서 고쳐도 다음 달에는 영향이 없어요."}{" "}
              지우면 이번 달만 건너뛰어요. 고정 항목 자체는 설정 › 가계부에서 바꿔요.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          {!isNew ? (
            <button type="button" onClick={remove} className="text-sm text-danger hover:opacity-80">
              {isPlanned ? "이번 달 건너뛰기" : "삭제"}
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
