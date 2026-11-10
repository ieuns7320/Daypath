"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/data/store";
import { fromInputs } from "@/lib/date";
import { MONEY_TYPE_LABEL, categoryBreakdown, formatWon, signedWon } from "@/lib/money";
import { colorVar } from "@/lib/palette";
import type { MoneyType } from "@/lib/types";
import { ChevronDownIcon } from "../icons";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const NO_CATEGORY = "var(--line-strong)";

/**
 * 가계부 분석: 보고 있는 달의 분류별 지출(또는 수입) 원그래프 + 분류 목록.
 * 분류를 누르면 그 달 그 분류 기록이 펼쳐진다. 예정(아직 날이 안 온 고정 항목)은 넣지 않는다.
 */
export function MoneyStats({ month, onOpen }: { month: string; onOpen: (entryId: string) => void }) {
  const { money_entries, money_categories } = useStore();
  const [type, setType] = useState<MoneyType>("expense");
  const [open, setOpen] = useState<string | null>(null); // 펼친 분류 (분류 없음 = "")

  const categoryOf = useMemo(() => new Map(money_categories.map((c) => [c.id, c])), [money_categories]);
  const groups = useMemo(() => categoryBreakdown(money_entries, month, type), [money_entries, month, type]);
  const total = groups.reduce((n, g) => n + g.amount, 0);
  const rows = groups.map((g) => {
    const c = g.categoryId ? categoryOf.get(g.categoryId) : undefined;
    return {
      ...g,
      key: g.categoryId ?? "",
      name: c?.name ?? "분류 없음",
      color: c ? colorVar(c.color) : NO_CATEGORY,
      ratio: total > 0 ? g.amount / total : 0,
    };
  });
  const amountColor = type === "income" ? "text-[var(--c-blue)]" : "text-danger";

  return (
    <div>
      <div role="radiogroup" aria-label="지출 또는 수입" className="mb-5 inline-flex rounded-lg bg-bg-hover p-0.5">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={type === t}
            onClick={() => {
              setType(t);
              setOpen(null);
            }}
            className={`rounded-md px-5 py-1.5 text-sm ${type === t ? "bg-bg font-medium shadow-sm" : "text-fg-muted"}`}
          >
            {MONEY_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-fg-faint">이 달 {MONEY_TYPE_LABEL[type]} 기록이 없어요.</p>
      ) : (
        <div className="md:flex md:items-start md:gap-10">
          {/* 원그래프 */}
          <div className="relative mx-auto mb-6 size-52 shrink-0 md:mx-0 md:size-60">
            <Donut
              segments={rows.map((r) => ({ key: r.key, value: r.amount, color: r.color }))}
              highlight={open}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-fg-faint">{MONEY_TYPE_LABEL[type]}</span>
              <span className={`text-lg font-semibold tabular-nums ${amountColor}`}>{formatWon(total)}</span>
            </div>
          </div>

          {/* 분류 목록 */}
          <ul className="min-w-0 flex-1 space-y-0.5">
            {rows.map((r) => {
              const isOpen = open === r.key;
              return (
                <li key={r.key}>
                  <button
                    onClick={() => setOpen(isOpen ? null : r.key)}
                    aria-expanded={isOpen}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-bg-hover"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <span className="size-3 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                      <span className="min-w-0 flex-1 truncate">
                        {r.name}
                        <span className="ml-1.5 text-xs text-fg-faint">{r.entries.length}건</span>
                      </span>
                      <span className="tabular-nums">{formatWon(r.amount)}</span>
                      <span className="w-10 text-right text-xs tabular-nums text-fg-muted">
                        {Math.round(r.ratio * 100)}%
                      </span>
                      <ChevronDownIcon
                        width={14}
                        height={14}
                        className={`shrink-0 text-fg-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </span>
                    <span className="mt-1.5 ml-5.5 mr-6 block h-1 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full" style={{ width: `${r.ratio * 100}%`, background: r.color }} />
                    </span>
                  </button>

                  {isOpen && (
                    <ul className="mb-2 ml-5.5 border-l border-line pl-2">
                      {r.entries.map((e) => (
                        <li key={e.id}>
                          <button
                            onClick={() => onOpen(e.id)}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg-hover"
                          >
                            <span className="w-16 shrink-0 text-xs tabular-nums text-fg-faint">{shortDate(e.date)}</span>
                            <span className="min-w-0 flex-1 truncate">
                              {e.title || <span className="text-fg-faint">{MONEY_TYPE_LABEL[e.type]}</span>}
                              {e.recurring_id && <span className="ml-1.5 text-xs text-fg-faint">↻</span>}
                            </span>
                            <span className={`shrink-0 tabular-nums ${amountColor}`}>{signedWon(e.amount, e.type)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 도넛 그래프: 원 둘레를 값 비율로 나눠 그린다. 펼친 분류가 있으면 나머지는 흐리게 */
function Donut({
  segments,
  highlight,
}: {
  segments: { key: string; value: number; color: string }[];
  highlight: string | null;
}) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((n, s) => n + s.value, 0);
  const gap = segments.length > 1 ? 0.8 : 0; // 조각 사이 틈
  const lengths = segments.map((s) => (s.value / sum) * c);
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((n, l) => n + l, 0));
  return (
    <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="14" />
      {segments.map((s, i) => {
        const dash = Math.max(lengths[i] - gap, 0.01);
        return (
          <circle
            key={s.key}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-starts[i]}
            className="transition-opacity"
            opacity={highlight === null || highlight === s.key ? 1 : 0.3}
          />
        );
      })}
    </svg>
  );
}

/** "11/5 (수)" */
function shortDate(date: string): string {
  const d = fromInputs(date);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}
