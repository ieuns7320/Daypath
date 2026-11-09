"use client";

import { addDays, fromInputs, toDateInput } from "@/lib/date";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "../icons";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 할 일 탭의 월간 미니 캘린더 (일요일 시작).
 * 날짜 위의 링이 그날 할 일을 끝낸 비율만큼 채워지고, 모두 끝내면 체크 표시.
 */
export function MiniMonth({
  month,
  selected,
  today,
  stats,
  onSelect,
  onMonth,
}: {
  /** 보고 있는 달의 1일 "YYYY-MM-01" */
  month: string;
  selected: string;
  today: string;
  stats: Map<string, { done: number; total: number }>;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
}) {
  const first = fromInputs(month);
  const year = first.getFullYear();
  const m = first.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  // 앞쪽 빈 칸 (일요일 시작)
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateInput(new Date(year, m, d)));

  const shift = (delta: number) => onMonth(toDateInput(new Date(year, m + delta, 1)));

  return (
    <div className="select-none">
      <div className="mb-4 flex items-center gap-1">
        <h2 className="flex-1 text-lg font-semibold tracking-tight">
          {year}년 {m + 1}월
        </h2>
        <button
          onClick={() => shift(-1)}
          aria-label="이전 달"
          className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <ChevronLeftIcon />
        </button>
        <button
          onClick={() => {
            onSelect(today);
            onMonth(today.slice(0, 8) + "01");
          }}
          className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          오늘
        </button>
        <button
          onClick={() => shift(1)}
          aria-label="다음 달"
          className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-xs text-fg-faint">
            {w}
          </span>
        ))}
        {cells.map((date, i) =>
          date ? (
            <DayCell
              key={date}
              date={date}
              stat={stats.get(date)}
              selected={date === selected}
              isToday={date === today}
              onClick={() => onSelect(date)}
            />
          ) : (
            <span key={`blank-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

function DayCell({
  date,
  stat,
  selected,
  isToday,
  onClick,
}: {
  date: string;
  stat?: { done: number; total: number };
  selected: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  const day = Number(date.slice(8));
  const dow = new Date(`${date}T00:00`).getDay();
  const label = `${Number(date.slice(5, 7))}월 ${day}일${
    stat ? `, 할 일 ${stat.total}개 중 ${stat.done}개 완료` : ""
  }`;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className="flex flex-col items-center gap-1 rounded-lg py-1.5 hover:bg-bg-hover"
    >
      <Ring stat={stat} />
      <span
        className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm tabular-nums ${
          selected
            ? "bg-fg font-semibold text-bg"
            : isToday
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
    </button>
  );
}

/* 링 크기 36px (반지름 15) */
const SIZE = 36;
const R = 15;
const C = 2 * Math.PI * R;

/** 진행률 링: 할 일이 없으면 흐린 빈 원, 있으면 끝낸 비율만큼 진하게 + 가운데 남은 개수, 모두 끝내면 체크 */
function Ring({ stat }: { stat?: { done: number; total: number } }) {
  const total = stat?.total ?? 0;
  const ratio = total ? stat!.done / total : 0;
  const complete = total > 0 && ratio === 1;
  return (
    <span className="relative flex size-9 items-center justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth="2.5"
          stroke={total ? "var(--line-strong)" : "var(--line)"}
          strokeDasharray={total ? undefined : "3 4"}
        />
        {ratio > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth="3"
            stroke="var(--fg)"
            strokeLinecap="round"
            strokeDasharray={`${C * ratio} ${C}`}
          />
        )}
      </svg>
      {complete && <CheckIcon width={18} height={18} className="absolute" />}
      {/* 남은 할 일 수 */}
      {!complete && total > 0 && (
        <span className="absolute text-[13px] font-semibold tabular-nums text-fg">
          {total - stat!.done}
        </span>
      )}
    </span>
  );
}

/** "YYYY-MM-DD" → 그 달 1일 "YYYY-MM-01" */
export function monthOf(date: string): string {
  return date.slice(0, 8) + "01";
}

/** 다음 날 "YYYY-MM-DD" */
export function nextDay(date: string): string {
  return toDateInput(addDays(fromInputs(date), 1));
}
