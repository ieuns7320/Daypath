"use client";

import { useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { newId, useScoped, useStore } from "@/lib/data/store";
import { fromInputs, todayInput } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import { carriedOver, dayStats, groupByCategory, type TaskGroup } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { ItemEditor, type EditorTarget } from "../editor/item-editor";
import { FilterButton } from "../filter/filter-button";
import { ChevronDownIcon, PlusIcon } from "../icons";
import { MiniMonth, monthOf } from "./mini-month";
import { TaskRow } from "./task-row";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* 데스크톱: 미니 캘린더 칸 너비 (경계선을 끌어 조절, 기기에 저장) */
const SPLIT_KEY = "daypath:todos-split";
const SPLIT_DEFAULT = 360;
const SPLIT_MIN = 320;
/** 목록 칸이 최소한 이만큼은 남게 */
const LIST_MIN = 320;

function readSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return v >= SPLIT_MIN ? v : SPLIT_DEFAULT;
  } catch {
    return SPLIT_DEFAULT;
  }
}
function saveSplit(v: number) {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(v)));
  } catch {
    // 저장 못 해도 이번 화면에서는 적용됨
  }
}

/**
 * 할 일 탭: 왼쪽(모바일은 위) 월간 미니 캘린더에서 날짜를 고르고,
 * 오른쪽(아래)에 그날 할 일을 카테고리별로 보여 준다. 캘린더 탭과는 독립.
 */
export function TasksView() {
  const { tasks } = useStore();
  // 할 일용 카테고리·태그만
  const { categories, matchesFilter, filter, filterActive } = useScoped("task");
  const today = todayInput();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [undatedOpen, setUndatedOpen] = useState(true);
  const [split, setSplit] = useState(readSplit);
  const bodyRef = useRef<HTMLDivElement>(null);

  /** 너비를 화면 안 허용 범위로 맞춘다 */
  const clampSplit = (v: number) => {
    const total = bodyRef.current?.clientWidth ?? 1200;
    return Math.round(Math.min(Math.max(v, SPLIT_MIN), Math.max(SPLIT_MIN, total - LIST_MIN)));
  };
  const changeSplit = (v: number) => {
    const next = clampSplit(v);
    setSplit(next);
    saveSplit(next);
  };

  const visible = useMemo(() => tasks.filter(matchesFilter), [tasks, matchesFilter]);
  const stats = useMemo(() => dayStats(visible), [visible]);
  const dayTasks = visible.filter((t) => t.due_date === selected);
  const isToday = selected === today;
  const carried = isToday ? carriedOver(visible, today) : [];
  const undated = isToday ? visible.filter((t) => t.due_date === null) : [];

  // 카테고리 필터가 걸려 있으면 그 카테고리 묶음만 (categories는 정렬되어 있음)
  const shownCategories = filter.categoryIds.length
    ? categories.filter((c) => filter.categoryIds.includes(c.id))
    : categories;
  const groups = groupByCategory(dayTasks, shownCategories);
  // 카테고리가 하나도 없으면 "할 일" 묶음 하나로 추가할 수 있게
  if (groups.length === 0) groups.push({ category: null, tasks: [] });

  const doneCount = dayTasks.filter((t) => t.done).length;
  const open = (t: Task) => setEditor({ kind: "task", id: t.id });

  const pick = (date: string) => {
    setSelected(date);
    if (monthOf(date) !== month) setMonth(monthOf(date));
  };

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
        <h1 className="flex-1 text-base font-semibold tracking-tight md:text-lg">할 일</h1>
        <FilterButton kind="task" />
      </header>

      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-y-auto md:flex md:overflow-hidden"
        style={{ "--split": `${split}px` } as React.CSSProperties}
      >
        {/* 미니 캘린더 */}
        <aside className="border-b border-line px-4 py-4 md:w-[var(--split)] md:shrink-0 md:overflow-y-auto md:border-b-0 md:px-6 md:py-5">
          <MiniMonth
            month={month}
            selected={selected}
            today={today}
            stats={stats}
            onSelect={pick}
            onMonth={setMonth}
          />
        </aside>

        {/* 데스크톱: 끌어서 두 칸 너비 조절 */}
        <SplitHandle
          value={split}
          bounds={bodyRef}
          onChange={(v) => setSplit(clampSplit(v))}
          onCommit={changeSplit}
          onReset={() => changeSplit(SPLIT_DEFAULT)}
        />

        {/* 고른 날의 할 일 */}
        <main className="min-w-0 flex-1 md:overflow-y-auto">
          <div className="max-w-2xl px-3 pb-24 pt-4 md:px-8 md:pt-5">
            <div className="mb-4 flex items-baseline gap-2 px-1">
              <h2 className="text-lg font-semibold tracking-tight">{dateTitle(selected)}</h2>
              {isToday && <span className="text-sm text-danger">오늘</span>}
              {dayTasks.length > 0 && (
                <span className="ml-auto text-xs tabular-nums text-fg-faint">
                  {doneCount} / {dayTasks.length} 완료
                </span>
              )}
            </div>

            {filterActive && (
              <p className="mb-3 px-1 text-xs text-fg-faint">필터가 적용되어 일부만 보여요.</p>
            )}

            {/* 밀린 할 일: 지난 날짜에 못 끝낸 것 (오늘을 볼 때만) */}
            {carried.length > 0 && (
              <section className="mb-6 rounded-xl border border-line px-1 py-2">
                <p className="px-2 pb-1 text-xs font-medium text-danger">
                  밀린 할 일 <span className="font-normal text-fg-faint">{carried.length}</span>
                </p>
                {carried.map((t) => (
                  <TaskRow key={t.id} task={t} showDate onOpen={() => open(t)} />
                ))}
              </section>
            )}

            <div className="space-y-6">
              {groups.map((g) => (
                <Group
                  key={g.category?.id ?? "none"}
                  group={g}
                  onlyGroup={categories.length === 0}
                  date={selected}
                  onOpen={open}
                />
              ))}
            </div>

            {/* 날짜 없는 할 일 (예전에 마감일 없이 만든 것 등) */}
            {undated.length > 0 && (
              <section className="mt-8">
                <button
                  onClick={() => setUndatedOpen(!undatedOpen)}
                  aria-expanded={undatedOpen}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-fg-muted"
                >
                  <ChevronDownIcon
                    width={14}
                    height={14}
                    className={`transition-transform ${undatedOpen ? "" : "-rotate-90"}`}
                  />
                  날짜 없음 <span className="font-normal text-fg-faint">{undated.length}</span>
                </button>
                {undatedOpen &&
                  undated.map((t) => <TaskRow key={t.id} task={t} onOpen={() => open(t)} />)}
              </section>
            )}
          </div>
        </main>
      </div>

      {editor && <ItemEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

/** 카테고리 한 묶음: 머리글(카테고리 색 테두리 + ＋) · 할 일 목록 · 바로 추가 입력칸 */
function Group({
  group,
  onlyGroup,
  date,
  onOpen,
}: {
  group: TaskGroup;
  onlyGroup: boolean;
  date: string;
  onOpen: (t: Task) => void;
}) {
  const { saveTask } = useStore();
  const { filter } = useScoped("task");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { category, tasks } = group;
  const name = category?.name ?? (onlyGroup ? "할 일" : "카테고리 없음");
  const color = category ? colorVar(category.color) : "var(--line-strong)";

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (!text) return setAdding(false);
    const now = new Date().toISOString();
    void saveTask({
      id: newId(),
      title: text,
      due_date: date,
      scheduled_start: null,
      scheduled_end: null,
      done: false,
      done_at: null,
      category_id: category?.id ?? null,
      // 태그 필터를 하나만 걸어 두었다면 그 태그도 붙인다 (추가하자마자 가려지지 않게)
      tag_ids: filter.tagIds.length === 1 ? [filter.tagIds[0]] : [],
      memo: "",
      created_at: now,
    });
    // 이어서 입력할 수 있게 칸은 열어 둔다
    setTitle("");
    inputRef.current?.focus();
  }

  return (
    <section>
      <div
        className="mb-1 inline-flex items-center gap-1 rounded-full border-[1.5px] py-0.5 pl-3 pr-1"
        style={{ borderColor: color }}
      >
        <span className="text-sm font-semibold">{name}</span>
        <button
          onClick={() => setAdding(true)}
          aria-label={`${name}에 할 일 추가`}
          className="rounded-full p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <PlusIcon width={15} height={15} />
        </button>
      </div>

      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={() => onOpen(t)} />
      ))}

      {adding && (
        <form onSubmit={submit} className="flex items-center gap-3 px-2 py-2">
          <span
            className="size-5 shrink-0 rounded-[5px] border-[1.5px] border-dashed"
            style={{ borderColor: color }}
          />
          <input
            ref={inputRef}
            // 열리자마자 바로 입력
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setAdding(false)}
            onKeyDown={(e) => e.key === "Escape" && (setTitle(""), setAdding(false))}
            placeholder="할 일 입력 후 Enter"
            aria-label={`${name} 할 일`}
            className="min-w-0 flex-1 border-b border-line bg-transparent pb-1 text-[15px] outline-none placeholder:text-fg-faint focus:border-fg-muted"
          />
        </form>
      )}

      {tasks.length === 0 && !adding && (
        <p className="px-2 py-1.5 text-xs text-fg-faint">＋를 눌러 추가</p>
      )}
    </section>
  );
}

/** "11월 9일 (월)", 다른 해면 연도 포함 */
function dateTitle(date: string): string {
  const d = fromInputs(date);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  return date.slice(0, 4) === todayInput().slice(0, 4) ? md : `${d.getFullYear()}년 ${md}`;
}

/**
 * 미니 캘린더와 목록 사이 경계선. 끌면 왼쪽 칸 너비가 바뀐다.
 * 키보드 ←/→로 16px씩, 두 번 누르면 기본 너비로.
 */
function SplitHandle({
  value,
  bounds,
  onChange,
  onCommit,
  onReset,
}: {
  value: number;
  bounds: React.RefObject<HTMLDivElement | null>;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(value);

  const widthAt = (e: PointerEvent) => e.clientX - (bounds.current?.getBoundingClientRect().left ?? 0);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="캘린더와 목록 너비 조절"
      aria-valuenow={value}
      tabIndex={0}
      title="끌어서 너비 조절 (두 번 누르면 기본값)"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        last.current = widthAt(e);
        onChange(last.current);
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(widthAt(e));
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onCommit(value - 16);
        if (e.key === "ArrowRight") onCommit(value + 16);
      }}
      className="group relative hidden w-px shrink-0 cursor-col-resize touch-none bg-line outline-none md:block"
    >
      {/* 잡기 쉬운 넓은 영역 + 가운데 손잡이 */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
      <span
        className={`absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-strong bg-bg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
          dragging ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
