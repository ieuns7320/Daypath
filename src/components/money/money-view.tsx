"use client";

import { useMemo, useState, type FormEvent } from "react";
import { newId, useStore } from "@/lib/data/store";
import { fromInputs, toDateInput, todayInput } from "@/lib/date";
import {
  budgetFor,
  daySums,
  formatWon,
  monthKey,
  monthSum,
  parseWon,
  shortWon,
  signedWon,
  type DaySum,
} from "@/lib/money";
import { colorVar } from "@/lib/palette";
import type { MoneyEntry } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "../icons";
import { MoneyEditor, type MoneyTarget } from "./money-editor";
import { useMoneyCategorySeed } from "./seed";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 가계부 탭: 데스크톱은 왼쪽(모바일은 위) 예산 요약 + 월간 달력, 오른쪽(아래) 고른 날 기록.
 * 달력 칸에는 그날 지출 합계(모바일은 줄인 금액)와 수입(파란 글자).
 */
export function MoneyView() {
  const store = useStore();
  const { money_entries, money_categories, money_budgets, moneyAvailable, ready, mode } = store;
  const today = todayInput();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(monthKey(today));
  const [editor, setEditor] = useState<MoneyTarget | null>(null);

  useMoneyCategorySeed();

  const sums = useMemo(() => daySums(money_entries), [money_entries]);
  const total = useMemo(() => monthSum(money_entries, month), [money_entries, month]);
  const budget = budgetFor(month, money_budgets);
  const categoryOf = useMemo(() => new Map(money_categories.map((c) => [c.id, c])), [money_categories]);

  const dayEntries = money_entries
    .filter((e) => e.date === selected)
    .sort((a, b) => (a.type === b.type ? a.created_at.localeCompare(b.created_at) : a.type === "income" ? -1 : 1));
  const daySum = sums.get(selected);

  const pick = (date: string) => {
    setSelected(date);
    if (monthKey(date) !== month) setMonth(monthKey(date));
  };
  const shift = (delta: number) => {
    const d = fromInputs(month);
    const next = toDateInput(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    setMonth(next);
    // 고른 날도 그 달로 (오늘이 있는 달이면 오늘, 아니면 1일)
    setSelected(monthKey(today) === next ? today : next);
  };

  if (mode === "cloud" && ready && !moneyAvailable) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-line px-4 py-2.5 md:px-6">
          <h1 className="text-base font-semibold tracking-tight md:text-lg">가계부</h1>
        </header>
        <p className="px-6 py-8 text-sm leading-6 text-fg-muted">
          가계부 테이블이 아직 없어요. Supabase SQL Editor에서{" "}
          <code className="rounded bg-bg-hover px-1 text-xs">supabase/migrations/008_money.sql</code>을
          실행한 뒤 새로고침해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
        <h1 className="flex-1 text-base font-semibold tracking-tight md:text-lg">가계부</h1>
        <button
          onClick={() => setEditor({ kind: "new", date: selected })}
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <PlusIcon width={15} height={15} />
          기록
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto md:flex md:overflow-hidden">
        {/* 요약 + 달력 */}
        <aside className="border-b border-line px-4 py-4 md:w-[440px] md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r md:px-6 md:py-5">
          <div className="mb-3 flex items-center gap-1">
            <h2 className="flex-1 text-lg font-semibold tracking-tight">
              {Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월
            </h2>
            <button onClick={() => shift(-1)} aria-label="이전 달" className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg">
              <ChevronLeftIcon />
            </button>
            <button
              onClick={() => {
                setMonth(monthKey(today));
                setSelected(today);
              }}
              className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              오늘
            </button>
            <button onClick={() => shift(1)} aria-label="다음 달" className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg">
              <ChevronRightIcon />
            </button>
          </div>

          <Summary month={month} today={today} total={total} budgetAmount={budget?.amount ?? null} />

          <MoneyMonth month={month} selected={selected} today={today} sums={sums} onSelect={pick} />
        </aside>

        {/* 고른 날 기록 */}
        <main className="min-w-0 flex-1 md:overflow-y-auto">
          <div className="max-w-2xl px-3 pb-24 pt-4 md:px-8 md:pt-5">
            <div className="mb-3 flex items-baseline gap-2 px-1">
              <h2 className="text-lg font-semibold tracking-tight">{dateTitle(selected)}</h2>
              {selected === today && <span className="text-sm text-danger">오늘</span>}
              <span className="ml-auto flex gap-2 text-sm tabular-nums">
                {daySum?.income ? <span className="text-[var(--c-blue)]">{signedWon(daySum.income, "income")}</span> : null}
                {daySum?.expense ? <span className="text-danger">{signedWon(daySum.expense, "expense")}</span> : null}
              </span>
            </div>

            {dayEntries.length === 0 ? (
              <p className="px-1 py-2 text-sm text-fg-faint">기록이 없어요.</p>
            ) : (
              <ul className="space-y-0.5">
                {dayEntries.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    category={e.category_id ? categoryOf.get(e.category_id) : undefined}
                    onOpen={() => setEditor({ kind: "entry", id: e.id })}
                  />
                ))}
              </ul>
            )}

            <button
              onClick={() => setEditor({ kind: "new", date: selected })}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              <PlusIcon width={16} height={16} />
              기록
            </button>
          </div>
        </main>
      </div>

      {editor && <MoneyEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

/* ---------- 예산 요약 ---------- */

function Summary({
  month,
  today,
  total,
  budgetAmount,
}: {
  month: string;
  today: string;
  total: DaySum;
  budgetAmount: number | null;
}) {
  const { saveMoneyBudget, money_budgets } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(0);
  const m = Number(month.slice(5, 7));

  function save(amount: number | null) {
    // 이 달부터 적용. 이 달에 이미 기록이 있으면 그걸 고친다
    const same = money_budgets.find((b) => b.month === month);
    void saveMoneyBudget({
      id: same?.id ?? newId(),
      month,
      amount,
      created_at: new Date().toISOString(),
    });
    setEditing(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save(draft > 0 ? draft : null);
  }

  if (editing)
    return (
      <form onSubmit={submit} className="mb-4 rounded-lg border border-line p-3">
        <p className="mb-2 text-xs text-fg-faint">{m}월부터 매달 적용할 예산</p>
        <div className="flex items-baseline gap-2 border-b border-line pb-1 focus-within:border-fg-muted">
          <input
            autoFocus
            inputMode="numeric"
            value={draft ? formatWon(draft) : ""}
            onChange={(e) => setDraft(parseWon(e.target.value))}
            placeholder="0"
            aria-label="한 달 예산"
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums outline-none placeholder:text-fg-faint"
          />
          <span className="text-sm text-fg-muted">원</span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          {budgetAmount !== null && (
            <button type="button" onClick={() => save(null)} className="px-1 py-1 text-xs text-fg-faint hover:text-danger">
              예산 없애기
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-fg-faint hover:text-fg">
            취소
          </button>
          <button type="submit" className="rounded-md bg-accent px-3 py-1 text-xs text-accent-fg">
            저장
          </button>
        </div>
      </form>
    );

  const open = () => {
    setDraft(budgetAmount ?? 0);
    setEditing(true);
  };

  if (budgetAmount === null)
    return (
      <div className="mb-4 space-y-1 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-fg-faint">지출</span>
          <span className="font-semibold tabular-nums text-danger">{formatWon(total.expense)}</span>
          <span className="ml-2 text-fg-faint">수입</span>
          <span className="font-semibold tabular-nums text-[var(--c-blue)]">{formatWon(total.income)}</span>
        </div>
        <button onClick={open} className="text-xs text-fg-faint hover:text-fg">
          + 예산 정하기
        </button>
      </div>
    );

  const used = total.expense;
  const left = budgetAmount - used;
  const ratio = budgetAmount > 0 ? used / budgetAmount : 1;
  // 이번 달이면 오늘 포함 남은 날, 지난 달·다음 달은 표시 안 함
  const isThisMonth = monthKey(today) === month;
  const lastDay = new Date(Number(month.slice(0, 4)), m, 0).getDate();
  const daysLeft = isThisMonth ? lastDay - Number(today.slice(8)) + 1 : 0;

  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-fg-faint">{m}월 예산</span>
        <button onClick={open} className="text-sm font-semibold tabular-nums hover:underline" title="예산 바꾸기">
          {formatWon(budgetAmount)}
        </button>
        <span className="ml-auto text-sm tabular-nums text-fg-muted">{Math.round(ratio * 100)}%</span>
      </div>
      <span className="relative mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${left < 0 ? "bg-danger" : "bg-fg"}`}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </span>
      <p className="mt-1.5 text-xs tabular-nums text-fg-muted">
        쓴 돈 <span className="text-danger">{formatWon(used)}</span> ·{" "}
        {left >= 0 ? (
          <>남은 돈 <b className="font-medium text-fg">{formatWon(left)}</b></>
        ) : (
          <b className="font-medium text-danger">{formatWon(-left)} 초과</b>
        )}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-fg-faint">
        {isThisMonth && left > 0 && `하루 ${formatWon(Math.floor(left / daysLeft))}원 (${daysLeft}일 남음) · `}
        수입 <span className="text-[var(--c-blue)]">{formatWon(total.income)}</span>
      </p>
    </div>
  );
}

/* ---------- 월간 달력 ---------- */

function MoneyMonth({
  month,
  selected,
  today,
  sums,
  onSelect,
}: {
  month: string;
  selected: string;
  today: string;
  sums: Map<string, DaySum>;
  onSelect: (date: string) => void;
}) {
  const first = fromInputs(month);
  const year = first.getFullYear();
  const m = first.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateInput(new Date(year, m, d)));

  return (
    <div className="grid select-none grid-cols-7 gap-y-1 text-center">
      {WEEKDAYS.map((w) => (
        <span key={w} className="pb-1 text-xs text-fg-faint">
          {w}
        </span>
      ))}
      {cells.map((date, i) => {
        if (!date) return <span key={`blank-${i}`} />;
        const day = Number(date.slice(8));
        const dow = (first.getDay() + day - 1) % 7;
        const s = sums.get(date);
        const isSel = date === selected;
        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            aria-pressed={isSel}
            aria-label={`${m + 1}월 ${day}일${s?.expense ? `, 지출 ${formatWon(s.expense)}원` : ""}${
              s?.income ? `, 수입 ${formatWon(s.income)}원` : ""
            }`}
            className="flex min-h-14 flex-col items-center gap-0.5 rounded-lg pb-1 pt-1 hover:bg-bg-hover"
          >
            <span
              className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm tabular-nums ${
                isSel
                  ? "bg-fg font-semibold text-bg"
                  : date === today
                    ? "font-semibold text-danger"
                    : dow === 0
                      ? "text-danger"
                      : dow === 6
                        ? "text-saturday"
                        : "text-fg-muted"
              }`}
            >
              {day}
            </span>
            {s?.expense ? <Amount value={s.expense} className="text-danger" /> : null}
            {s?.income ? <Amount value={s.income} plus className="text-[var(--c-blue)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** 칸 금액: 모바일은 줄여서(2.4만), 데스크톱은 전체(23,500) */
function Amount({ value, plus, className }: { value: number; plus?: boolean; className: string }) {
  return (
    <span className={`max-w-full truncate text-[10px] leading-3 tabular-nums ${className}`}>
      <span className="md:hidden">
        {plus && "+"}
        {shortWon(value)}
      </span>
      <span className="hidden md:inline">
        {plus && "+"}
        {formatWon(value)}
      </span>
    </span>
  );
}

/* ---------- 기록 한 줄 ---------- */

function EntryRow({
  entry,
  category,
  onOpen,
}: {
  entry: MoneyEntry;
  category?: { name: string; color: Parameters<typeof colorVar>[0] };
  onOpen: () => void;
}) {
  const income = entry.type === "income";
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-left hover:bg-bg-hover"
        style={{ borderLeftColor: category ? colorVar(category.color) : "var(--line-strong)" }}
      >
        <span className="w-12 shrink-0 truncate text-xs text-fg-faint">{category?.name ?? "분류 없음"}</span>
        <span className="min-w-0 flex-1 truncate text-[15px]">
          {entry.title || <span className="text-fg-faint">{income ? "수입" : "지출"}</span>}
          {entry.recurring_id && <span className="ml-1.5 text-xs text-fg-faint" title="고정 항목">↻</span>}
        </span>
        <span className={`shrink-0 text-[15px] tabular-nums ${income ? "text-[var(--c-blue)]" : "text-danger"}`}>
          {signedWon(entry.amount, entry.type)}
        </span>
      </button>
    </li>
  );
}

/** "11월 9일 (월)", 다른 해면 연도 포함 */
function dateTitle(date: string): string {
  const d = fromInputs(date);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  return date.slice(0, 4) === todayInput().slice(0, 4) ? md : `${d.getFullYear()}년 ${md}`;
}
