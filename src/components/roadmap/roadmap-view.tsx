"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { newId, useStore } from "@/lib/data/store";
import { todayInput, timeLabel, toDateInput } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import {
  dDay,
  goalInfo,
  percent,
  shortDate,
  sortGoals,
  type GoalInfo,
  type MilestoneInfo,
} from "@/lib/roadmap";
import type { CalendarEvent, Goal, Task } from "@/lib/types";
import { ItemEditor, type EditorTarget } from "../editor/item-editor";
import { CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, PlusIcon } from "../icons";
import { DatePicker } from "../pickers";
import { TaskRow } from "../tasks/task-row";
import { GoalDialog, MilestoneDialog } from "./roadmap-dialogs";
import { RoadmapTimeline } from "./roadmap-timeline";

/**
 * 로드맵 탭: 왼쪽 목표 목록 + 오른쪽 고른 목표의 마일스톤·할 일·관련 일정.
 * 모바일은 목록 → 누르면 상세(‹ 목표로 돌아가기).
 * 진행률: 마일스톤 = 연결된 할 일 완료 비율(할 일이 없으면 직접 체크), 목표 = 마일스톤 평균.
 */
export function RoadmapView() {
  const { goals, milestones, tasks, events } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 모바일: 상세를 보고 있는지 */
  const [mobileDetail, setMobileDetail] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [goalDialog, setGoalDialog] = useState<Goal | "new" | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [view, setView] = useState<"list" | "timeline">("list");

  const infos = useMemo(
    () => sortGoals(goals).map((g) => goalInfo(g, milestones, tasks, events)),
    [goals, milestones, tasks, events],
  );
  const active = infos.filter((i) => !i.goal.archived);
  const archived = infos.filter((i) => i.goal.archived);
  // 고른 목표가 없으면(처음, 지운 뒤) 첫 목표
  const selected = infos.find((i) => i.goal.id === selectedId) ?? active[0] ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
  };

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
        {view === "list" && mobileDetail && selected && (
          <button
            onClick={() => setMobileDetail(false)}
            aria-label="목표 목록"
            className="-ml-1.5 rounded-md p-1 text-fg-muted hover:bg-bg-hover md:hidden"
          >
            <ChevronLeftIcon />
          </button>
        )}
        <h1 className="text-base font-semibold tracking-tight md:text-lg">로드맵</h1>
        <div className="flex-1">
          {infos.length > 0 && (
            <div
              role="radiogroup"
              aria-label="보기"
              className="ml-2 inline-flex rounded-md border border-line p-0.5 text-xs md:ml-4"
            >
              {(
                [
                  ["list", "목록"],
                  ["timeline", "타임라인"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={view === key}
                  onClick={() => setView(key)}
                  className={`rounded px-2.5 py-1 ${
                    view === key ? "bg-bg-hover font-medium text-fg" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setGoalDialog("new")}
          className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <PlusIcon width={15} height={15} /> 목표
        </button>
      </header>

      {infos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-fg-muted">
            이루고 싶은 목표를 만들고, 마일스톤으로 나눠 할 일을 연결해 보세요.
          </p>
          <button
            onClick={() => setGoalDialog("new")}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            첫 목표 만들기
          </button>
        </div>
      ) : view === "timeline" ? (
        <div className="min-h-0 flex-1">
          <RoadmapTimeline
            infos={active}
            onOpenGoal={setGoalDialog}
            onSelectGoal={(id) => {
              select(id);
              setView("list");
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 md:flex">
          {/* 목표 목록 */}
          <aside
            className={`h-full overflow-y-auto border-line px-3 py-4 md:block md:w-72 md:shrink-0 md:border-r ${
              mobileDetail && selected ? "hidden" : ""
            }`}
          >
            <ul className="space-y-1">
              {active.map((i) => (
                <GoalItem
                  key={i.goal.id}
                  info={i}
                  selected={selected?.goal.id === i.goal.id}
                  onClick={() => select(i.goal.id)}
                />
              ))}
            </ul>
            {active.length === 0 && (
              <p className="px-2 py-2 text-xs text-fg-faint">진행 중인 목표가 없어요.</p>
            )}

            {archived.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setArchivedOpen(!archivedOpen)}
                  aria-expanded={archivedOpen}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-fg-muted"
                >
                  <ChevronDownIcon
                    width={14}
                    height={14}
                    className={`transition-transform ${archivedOpen ? "" : "-rotate-90"}`}
                  />
                  보관함 <span className="font-normal text-fg-faint">{archived.length}</span>
                </button>
                {archivedOpen && (
                  <ul className="mt-1 space-y-1">
                    {archived.map((i) => (
                      <GoalItem
                        key={i.goal.id}
                        info={i}
                        selected={selected?.goal.id === i.goal.id}
                        onClick={() => select(i.goal.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>

          {/* 고른 목표 상세 */}
          <main
            className={`h-full min-w-0 flex-1 overflow-y-auto md:block ${mobileDetail && selected ? "" : "hidden"}`}
          >
            {selected ? (
              <GoalDetail
                info={selected}
                onEditGoal={() => setGoalDialog(selected.goal)}
                onOpenTask={(t) => setEditor({ kind: "task", id: t.id })}
                onOpenEvent={(e) => setEditor({ kind: "event", id: e.id })}
              />
            ) : (
              <p className="px-8 py-6 text-sm text-fg-faint">왼쪽에서 목표를 골라 주세요.</p>
            )}
          </main>
        </div>
      )}

      {goalDialog && (
        <GoalDialog
          goal={goalDialog === "new" ? undefined : goalDialog}
          onClose={() => setGoalDialog(null)}
          onCreated={select}
        />
      )}
      {editor && <ItemEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

/** 목록의 목표 한 줄: 색 테두리 + 제목 + D-day + 진행률 */
function GoalItem({ info, selected, onClick }: { info: GoalInfo; selected: boolean; onClick: () => void }) {
  const { goal, progress } = info;
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={selected}
        className={`w-full rounded-lg border-l-[3px] px-3 py-2 text-left hover:bg-bg-hover ${
          selected ? "bg-bg-hover" : ""
        }`}
        style={{ borderLeftColor: colorVar(goal.color) }}
      >
        <div className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${selected ? "font-semibold" : ""}`}>
            {goal.title}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-fg-muted">{percent(progress)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar value={progress} color={colorVar(goal.color)} thin />
          {goal.target_date && !goal.archived && (
            <span className="shrink-0 text-[11px] tabular-nums text-fg-faint">{dDay(goal.target_date)}</span>
          )}
        </div>
      </button>
    </li>
  );
}

function ProgressBar({ value, color, thin = false }: { value: number; color: string; thin?: boolean }) {
  return (
    <span
      className={`relative block w-full overflow-hidden rounded-full bg-line ${thin ? "h-1" : "h-1.5"}`}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width]"
        style={{ width: `${value * 100}%`, background: color }}
      />
    </span>
  );
}

/* ---------- 상세 ---------- */

function GoalDetail({
  info,
  onEditGoal,
  onOpenTask,
  onOpenEvent,
}: {
  info: GoalInfo;
  onEditGoal: () => void;
  onOpenTask: (t: Task) => void;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  const { goal, milestones, progress, completeCount } = info;
  const color = colorVar(goal.color);
  return (
    <div className="max-w-2xl px-4 pb-24 pt-5 md:px-8">
      {/* 목표 머리 */}
      <div className="border-l-[3px] pl-4" style={{ borderLeftColor: color }}>
        <div className="flex items-baseline gap-3">
          <button onClick={onEditGoal} className="min-w-0 text-left" title="목표 수정">
            <h2 className="text-xl font-semibold tracking-tight hover:underline">{goal.title}</h2>
          </button>
          {goal.archived && <span className="shrink-0 text-xs text-fg-faint">보관함</span>}
          {goal.target_date && (
            <span className="ml-auto shrink-0 text-sm tabular-nums text-fg-muted">
              {shortDate(goal.target_date)} · <b className="font-medium text-fg">{dDay(goal.target_date)}</b>
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={progress} color={color} />
          <span className="shrink-0 text-sm font-medium tabular-nums">{percent(progress)}</span>
        </div>
        <p className="mt-1.5 text-xs text-fg-faint">
          마일스톤 {completeCount} / {milestones.length} 완료
        </p>
        {goal.memo && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-fg-muted">{goal.memo}</p>}
      </div>

      {/* 마일스톤 */}
      <div className="mt-8 space-y-7">
        {milestones.map((m) => (
          <MilestoneBlock
            key={m.milestone.id}
            info={m}
            color={color}
            onOpenTask={onOpenTask}
            onOpenEvent={onOpenEvent}
          />
        ))}
      </div>

      <AddMilestone goal={goal} count={milestones.length} />
    </div>
  );
}

function MilestoneBlock({
  info,
  color,
  onOpenTask,
  onOpenEvent,
}: {
  info: MilestoneInfo;
  color: string;
  onOpenTask: (t: Task) => void;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  const { saveMilestone } = useStore();
  const { milestone, tasks, events, progress, complete } = info;
  const [editing, setEditing] = useState(false);
  const manual = tasks.length === 0;
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <section>
      <div className="flex items-center gap-2.5">
        {manual ? (
          // 할 일이 없으면 직접 완료 체크
          <button
            onClick={() => void saveMilestone({ ...milestone, done: !milestone.done })}
            aria-pressed={milestone.done}
            aria-label={milestone.done ? "완료 취소" : "완료로 표시"}
            className="flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]"
            style={{ borderColor: color, color }}
          >
            {milestone.done && <CheckIcon width={13} height={13} />}
          </button>
        ) : (
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]"
            style={{ borderColor: color, color }}
            aria-hidden="true"
          >
            {complete && <CheckIcon width={13} height={13} />}
          </span>
        )}
        <button
          onClick={() => setEditing(true)}
          className={`min-w-0 flex-1 truncate text-left text-[15px] font-semibold hover:underline ${
            complete ? "text-fg-muted" : ""
          }`}
          title="마일스톤 수정"
        >
          {milestone.title}
        </button>
        {milestone.target_date && (
          <span
            className={`shrink-0 text-xs tabular-nums ${
              !complete && milestone.target_date < todayInput() ? "text-danger" : "text-fg-muted"
            }`}
          >
            {shortDate(milestone.target_date)}
          </span>
        )}
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-fg-muted">{percent(progress)}</span>
      </div>
      {!manual && (
        <div className="ml-[30px] mt-1.5 flex items-center gap-2">
          <ProgressBar value={progress} color={color} thin />
          <span className="shrink-0 text-[11px] tabular-nums text-fg-faint">
            {doneCount}/{tasks.length}
          </span>
        </div>
      )}

      <div className="ml-[18px] mt-1">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} inRoadmap onOpen={() => onOpenTask(t)} />
        ))}
        {events.map((e) => (
          <EventRow key={e.id} event={e} onOpen={() => onOpenEvent(e)} />
        ))}
        <AddTask milestoneId={milestone.id} />
      </div>

      {editing && <MilestoneDialog milestone={milestone} onClose={() => setEditing(false)} />}
    </section>
  );
}

/** 관련 일정 한 줄 (진행률에는 들어가지 않음) */
function EventRow({ event, onOpen }: { event: CalendarEvent; onOpen: () => void }) {
  const start = new Date(event.start_at);
  const when = `${shortDate(toDateInput(start))}${event.all_day ? "" : ` ${timeLabel(event.start_at)}`}${
    event.rrule ? " · 반복" : ""
  }`;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover"
      title="관련 일정 (진행률에는 들어가지 않아요)"
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-fg-faint">
        <CalendarIcon width={16} height={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{event.title}</span>
      <span className="shrink-0 text-xs tabular-nums text-fg-faint">{when}</span>
    </button>
  );
}

/** 마일스톤 아래 할 일 바로 추가: 제목 + 하는 날(선택). Enter 뒤에도 칸은 열어 둔다 */
function AddTask({ milestoneId }: { milestoneId: string }) {
  const { saveTask } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return setOpen(false);
    void saveTask({
      id: newId(),
      title: text,
      due_date: day || null,
      scheduled_start: null,
      scheduled_end: null,
      done: false,
      done_at: null,
      category_id: null,
      tag_ids: [],
      memo: "",
      created_at: new Date().toISOString(),
      milestone_id: milestoneId,
    });
    setTitle("");
    inputRef.current?.focus();
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-fg-faint hover:text-fg"
      >
        <PlusIcon width={13} height={13} /> 할 일
      </button>
    );

  return (
    <form
      onSubmit={submit}
      onBlur={(e) => {
        // 칸 밖으로 나가고 제목이 비어 있으면 닫기
        if (!e.currentTarget.contains(e.relatedTarget as Node) && !title.trim()) setOpen(false);
      }}
      className="flex flex-wrap items-center gap-2 px-2 py-1.5"
    >
      <span className="size-5 shrink-0 rounded-[5px] border-[1.5px] border-dashed border-line-strong" />
      <input
        ref={inputRef}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (setTitle(""), setOpen(false))}
        placeholder="할 일 입력 후 Enter"
        aria-label="마일스톤 할 일"
        className="min-w-0 flex-1 border-b border-line bg-transparent pb-1 text-[15px] outline-none placeholder:text-fg-faint focus:border-fg-muted"
      />
      <DatePicker
        value={day}
        onChange={setDay}
        ariaLabel="하는 날 (선택, 정하면 할 일 탭 그날에도 보여요)"
        placeholder="하는 날"
        className="!px-1.5 !py-0.5 !text-xs text-fg-muted"
      />
    </form>
  );
}

function AddMilestone({ goal, count }: { goal: Goal; count: number }) {
  const { saveMilestone } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return setOpen(false);
    void saveMilestone({
      id: newId(),
      goal_id: goal.id,
      title: text,
      target_date: null,
      done: false,
      sort_order: count,
      created_at: new Date().toISOString(),
    });
    setTitle("");
    inputRef.current?.focus();
  }

  return (
    <div className="mt-8">
      {open ? (
        <form onSubmit={submit} className="flex items-center gap-2.5">
          <span className="size-5 shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong" />
          <input
            ref={inputRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && (setTitle(""), setOpen(false))}
            placeholder="마일스톤 입력 후 Enter (목표일은 눌러서 정하기)"
            aria-label="새 마일스톤"
            className="min-w-0 flex-1 border-b border-line bg-transparent pb-1 text-[15px] outline-none placeholder:text-fg-faint focus:border-fg-muted"
          />
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-1.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          <PlusIcon width={15} height={15} /> 마일스톤
        </button>
      )}
    </div>
  );
}
