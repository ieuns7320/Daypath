"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { daysBetween, fromInputs, toDateInput, todayInput } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import { percent, shortDate, type GoalInfo } from "@/lib/roadmap";
import type { Goal, Milestone } from "@/lib/types";
import { MilestoneDialog } from "./roadmap-dialogs";

/**
 * 로드맵 타임라인 (4b): 진행 중인 목표를 시간축 가로 막대로, 마일스톤은 막대 위 ◆.
 * - 막대: 시작일(없으면 만든 날) → 목표일. 목표일이 없으면 점선으로 열어 둔다.
 * - 단위: 월 / 분기 / 년. 가로로 스크롤하고, 처음엔 오늘이 왼쪽 1/4쯤에 오게 한다.
 * - 보기 전용: 막대를 누르면 목표 수정 창, ◆를 누르면 마일스톤 수정 창. 끌어서 바꾸지 않는다.
 */

export type Scale = "month" | "quarter" | "year";

const SCALES: { key: Scale; label: string; /** 하루 폭(px) */ px: number; /** 최소 개월 수 */ months: number }[] = [
  { key: "month", label: "월", px: 6, months: 7 },
  { key: "quarter", label: "분기", px: 2, months: 13 },
  { key: "year", label: "년", px: 0.6, months: 37 },
];

const ROW = 64;
const HEAD = 44;

/** 그 달 1일 */
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
function addMonths(date: string, n: number) {
  const d = fromInputs(date);
  return toDateInput(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

type Bar = {
  info: GoalInfo;
  start: string;
  /** 목표일이 없으면 null (열린 막대) */
  end: string | null;
  /** 그릴 오른쪽 끝 */
  drawEnd: string;
  dated: Milestone[];
};

function barOf(info: GoalInfo, today: string): Bar {
  const { goal } = info;
  const dated = info.milestones.map((m) => m.milestone).filter((m) => m.target_date);
  const created = toDateInput(new Date(goal.created_at));
  let start = goal.start_date ?? created;
  // 목표일이 시작일(만든 날)보다 앞이면 목표일에서 시작
  if (goal.target_date && goal.target_date < start) start = goal.target_date;
  const last = dated.reduce((max, m) => (m.target_date! > max ? m.target_date! : max), start);
  const drawEnd = goal.target_date ?? [last, today].reduce((a, b) => (a > b ? a : b));
  return { info, start, end: goal.target_date, drawEnd, dated };
}

export function RoadmapTimeline({
  infos,
  onOpenGoal,
  onSelectGoal,
}: {
  /** 보관하지 않은 목표만 */
  infos: GoalInfo[];
  onOpenGoal: (g: Goal) => void;
  /** 목표 이름을 누르면 목록 보기의 그 목표로 */
  onSelectGoal: (id: string) => void;
}) {
  const [scale, setScale] = useState<Scale>("month");
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayInput();
  const { px, months: minMonths } = SCALES.find((s) => s.key === scale)!;

  const bars = useMemo(() => infos.map((i) => barOf(i, today)), [infos, today]);

  // 보여 줄 기간: 모든 막대·마일스톤·오늘을 포함, 앞뒤로 한 달 여유, 달 단위로 맞춤
  const { from, to, ticks } = useMemo(() => {
    const dates = [today, ...bars.flatMap((b) => [b.start, b.drawEnd, ...b.dated.map((m) => m.target_date!)])];
    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const from = addMonths(monthStart(min), -1);
    let to = addMonths(monthStart(max), 2);
    if (daysBetween(from, to) < daysBetween(from, addMonths(from, minMonths)))
      to = addMonths(from, minMonths);
    const ticks: string[] = [];
    for (let d = from; d < to; d = addMonths(d, 1)) ticks.push(d);
    return { from, to, ticks };
  }, [bars, today, minMonths]);

  const x = (date: string) => daysBetween(from, date) * px;
  const width = x(to);

  // 처음과 단위를 바꿀 때 오늘이 왼쪽 1/4쯤 오게
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, x(today) - el.clientWidth / 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: Math.max(0, x(today) - el.clientWidth / 4), behavior: "smooth" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col [--tl-label:7.5rem] md:[--tl-label:12rem]">
      <div className="flex items-center gap-2 px-4 py-2 md:px-6">
        <div role="radiogroup" aria-label="시간 단위" className="flex rounded-md border border-line p-0.5 text-xs">
          {SCALES.map((s) => (
            <button
              key={s.key}
              role="radio"
              aria-checked={scale === s.key}
              onClick={() => setScale(s.key)}
              className={`rounded px-2.5 py-1 ${
                scale === s.key ? "bg-bg-hover font-medium text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={scrollToToday}
          className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted hover:border-line-strong hover:text-fg"
        >
          오늘
        </button>
      </div>

      {bars.length === 0 ? (
        <p className="px-6 py-6 text-sm text-fg-faint">진행 중인 목표가 없어요.</p>
      ) : (
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto border-t border-line">
          <div className="relative" style={{ width: `calc(var(--tl-label) + ${width}px)` }}>
            {/* 시간축 머리 (위에 고정) */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-bg" style={{ height: HEAD }}>
              <div className="sticky left-0 z-10 w-[var(--tl-label)] shrink-0 border-r border-line bg-bg" />
              <div className="relative" style={{ width }}>
                {ticks.map((t) => (
                  <TickLabel key={t} date={t} left={x(t)} scale={scale} first={t === from} />
                ))}
              </div>
            </div>

            {/* 목표 줄 */}
            {bars.map((b) => (
              <div key={b.info.goal.id} className="flex border-b border-line" style={{ height: ROW }}>
                <button
                  onClick={() => onSelectGoal(b.info.goal.id)}
                  className="sticky left-0 z-10 w-[var(--tl-label)] shrink-0 border-r border-line bg-bg px-3 text-left hover:bg-bg-hover"
                  title="목록에서 보기"
                >
                  <span
                    className="block border-l-[3px] pl-2"
                    style={{ borderLeftColor: colorVar(b.info.goal.color) }}
                  >
                    <span className="block truncate text-sm">{b.info.goal.title}</span>
                    <span className="block text-[11px] tabular-nums text-fg-faint">
                      {percent(b.info.progress)}
                      {b.end && ` · ${shortDate(b.end)}`}
                    </span>
                  </span>
                </button>
                <div className="relative" style={{ width }}>
                  <GoalBar bar={b} x={x} today={today} onOpenGoal={onOpenGoal} onOpenMilestone={setMilestone} />
                </div>
              </div>
            ))}

            {/* 달 경계선 + 오늘 선 (줄 위에 겹쳐 그림) */}
            <div
              className="pointer-events-none absolute bottom-0 left-[var(--tl-label)]"
              style={{ top: HEAD, width }}
              aria-hidden="true"
            >
              {ticks.map((t) =>
                t === from ? null : (
                  <span
                    key={t}
                    className={`absolute inset-y-0 border-l ${
                      t.endsWith("-01-01") || scale === "month" || (scale === "quarter" && isQuarter(t))
                        ? "border-line"
                        : "border-line/40"
                    }`}
                    style={{ left: x(t) }}
                  />
                ),
              )}
              <span className="absolute inset-y-0 border-l border-danger" style={{ left: x(today) }} />
            </div>
            <span
              className="pointer-events-none absolute z-20 -translate-x-1/2 rounded bg-danger px-1 text-[10px] font-medium leading-4 text-white"
              style={{ left: `calc(var(--tl-label) + ${x(today)}px)`, top: 4 }}
            >
              오늘
            </span>
          </div>
        </div>
      )}

      {milestone && <MilestoneDialog milestone={milestone} onClose={() => setMilestone(null)} />}
    </div>
  );
}

const isQuarter = (date: string) => ["01", "04", "07", "10"].includes(date.slice(5, 7));

/** 머리 글자: 월 단위는 매달, 분기는 매달 짧게, 년은 분기 시작 달만. 1월(또는 맨 앞)에는 연도 */
function TickLabel({ date, left, scale, first }: { date: string; left: number; scale: Scale; first: boolean }) {
  const month = Number(date.slice(5, 7));
  const showYear = first || month === 1;
  const showMonth = scale !== "year" || isQuarter(date);
  if (!showYear && !showMonth) return null;
  return (
    <span className="absolute bottom-1.5 whitespace-nowrap pl-1.5 text-xs leading-none" style={{ left }}>
      {showYear && <span className="block pb-1 text-[11px] font-medium text-fg-muted">{date.slice(0, 4)}년</span>}
      {showMonth && <span className="text-fg-faint">{month}월</span>}
    </span>
  );
}

/** 목표 막대 + 마일스톤 ◆ + 이름 (겹치면 이름 생략) */
function GoalBar({
  bar,
  x,
  today,
  onOpenGoal,
  onOpenMilestone,
}: {
  bar: Bar;
  x: (date: string) => number;
  today: string;
  onOpenGoal: (g: Goal) => void;
  onOpenMilestone: (m: Milestone) => void;
}) {
  const { info, start, end, drawEnd, dated } = bar;
  const color = colorVar(info.goal.color);
  const left = x(start);
  // 하루짜리도 보이게 끝은 그날 끝까지
  const w = Math.max(x(drawEnd) - left + (x("2000-01-02") - x("2000-01-01")), 8);
  const complete = new Map(info.milestones.map((m) => [m.milestone.id, m.complete]));

  // 이름이 겹치지 않게: 앞 이름의 끝보다 왼쪽이면 생략 (글자당 약 7px)
  const labels = dated.reduce<{ show: boolean[]; end: number }>(
    (acc, m) => {
      const cx = x(m.target_date!);
      const show = cx - 4 > acc.end;
      return {
        show: [...acc.show, show],
        end: show ? cx + Math.min(m.title.length * 7, 140) + 8 : acc.end,
      };
    },
    { show: [], end: -Infinity },
  ).show;

  return (
    <>
      <button
        onClick={() => onOpenGoal(info.goal)}
        title={`${info.goal.title} · ${percent(info.progress)} (눌러서 수정)`}
        className={`absolute top-3 h-5 overflow-hidden border-[1.5px] ${
          end ? "rounded-md" : "rounded-l-md border-r-0 border-dashed"
        } hover:bg-bg-hover`}
        style={{ left, width: w, borderColor: color }}
      >
        {/* 진행률: 막대 안 아래쪽 얇은 선 */}
        <span
          className="absolute bottom-[3px] left-[3px] h-[3px] rounded-full"
          style={{ width: `calc((100% - 6px) * ${info.progress})`, background: color }}
        />
      </button>

      {dated.map((m, i) => {
        const done = complete.get(m.id);
        const late = !done && m.target_date! < today;
        const cx = x(m.target_date!) + (x("2000-01-02") - x("2000-01-01")) / 2;
        return (
          <button
            key={m.id}
            onClick={() => onOpenMilestone(m)}
            title={`${m.title} · ${shortDate(m.target_date!)}${done ? " · 완료" : ""}`}
            className="group absolute top-[13px] flex -translate-x-1/2 flex-col items-center"
            style={{ left: cx }}
          >
            <span
              className="size-3 rotate-45 border-[1.5px] bg-bg"
              style={{ borderColor: late ? "var(--color-danger)" : color, background: done ? color : undefined }}
            />
            <span
              className={`absolute top-[22px] whitespace-nowrap text-[11px] leading-none group-hover:block ${
                labels[i] ? "" : "hidden"
              } ${late ? "text-danger" : "text-fg-muted"} max-w-[140px] truncate`}
              style={{ left: -2 }}
            >
              {m.title}
            </span>
          </button>
        );
      })}
    </>
  );
}
