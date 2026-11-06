"use client";

import { useMemo, useState, type FormEvent } from "react";
import { newId, useStore } from "@/lib/data/store";
import { addDays, toDateInput, todayInput } from "@/lib/date";
import { groupTasks, TASK_GROUPS, type TaskGroupKey, type TaskSort } from "@/lib/tasks";
import { ItemEditor, newTaskTarget, type EditorTarget } from "../editor/item-editor";
import { FilterButton } from "../filter/filter-button";
import { ChevronDownIcon, PlusIcon } from "../icons";
import { TaskRow } from "./task-row";

const SORT_KEY = "daypath:tasks-sort";

function readSort(): TaskSort {
  try {
    return localStorage.getItem(SORT_KEY) === "created" ? "created" : "due";
  } catch {
    return "due";
  }
}

export function TasksView() {
  const { tasks, matchesFilter, filterActive } = useStore();
  const [sort, setSort] = useState<TaskSort>(readSort);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TaskGroupKey>>(() => new Set(["done"]));

  const groups = useMemo(
    () => groupTasks(tasks.filter(matchesFilter), sort),
    [tasks, matchesFilter, sort],
  );
  const openCount = tasks.filter((t) => !t.done && matchesFilter(t)).length;

  function changeSort(next: TaskSort) {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // 저장 못 해도 이번 화면에서는 적용됨
    }
  }

  function toggleGroup(key: TaskGroupKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
        <h1 className="flex-1 text-base font-semibold tracking-tight md:text-lg">
          할 일 <span className="ml-1 text-sm font-normal text-fg-faint">{openCount}</span>
        </h1>
        <div className="flex rounded-lg bg-bg-hover p-0.5" role="tablist" aria-label="정렬">
          {(
            [
              ["due", "마감일순"],
              ["created", "최신순"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={sort === key}
              onClick={() => changeSort(key)}
              className={`rounded-md px-2.5 py-1 text-xs md:text-sm ${
                sort === key ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <FilterButton />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-2 pb-24 pt-3 md:px-4">
          <QuickAdd />

          {filterActive && (
            <p className="px-2 pt-3 text-xs text-fg-faint">필터가 적용되어 일부만 보여요.</p>
          )}

          {TASK_GROUPS.map(({ key, label }) => {
            const list = groups[key];
            if (list.length === 0) return null;
            const isCollapsed = collapsed.has(key);
            return (
              <section key={key} className="mt-3">
                <button
                  onClick={() => toggleGroup(key)}
                  className={`flex w-full items-center gap-1.5 px-2 py-1 text-xs font-medium ${
                    key === "overdue" ? "text-danger" : "text-fg-muted"
                  }`}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDownIcon
                    width={14}
                    height={14}
                    className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                  {label}
                  <span className="font-normal text-fg-faint">{list.length}</span>
                </button>
                {!isCollapsed && (
                  <div>
                    {list.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        showDue={key !== "today"}
                        onOpen={() => setEditor({ kind: "task", id: t.id })}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {tasks.length === 0 && (
            <p className="px-2 py-10 text-center text-sm text-fg-faint">
              아직 할 일이 없어요. 위에서 바로 추가해 보세요.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => setEditor(newTaskTarget())}
        aria-label="새 할 일"
        className="absolute bottom-5 right-5 z-10 flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg hover:opacity-90"
      >
        <PlusIcon width={22} height={22} />
      </button>

      {editor && <ItemEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

/** 목록 맨 위 빠른 추가: 제목 입력 + 마감일(없음/오늘/내일) */
function QuickAdd() {
  const { saveTask, categories, filter } = useStore();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<"none" | "today" | "tomorrow">("none");

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    const today = todayInput();
    // 카테고리 필터를 하나만 걸어 두었다면 그 카테고리로 바로 넣는다 (추가하자마자 안 보이는 일 방지)
    const categoryId =
      filter.categoryIds.length === 1 ? filter.categoryIds[0] : (categories[0]?.id ?? null);
    void saveTask({
      id: newId(),
      title: name,
      due_date:
        due === "today" ? today : due === "tomorrow" ? toDateInput(addDays(new Date(), 1)) : null,
      scheduled_start: null,
      scheduled_end: null,
      done: false,
      done_at: null,
      category_id: categoryId,
      tag_ids: filter.tagIds.length === 1 ? [filter.tagIds[0]] : [],
      memo: "",
      created_at: new Date().toISOString(),
    });
    setTitle("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
      <PlusIcon width={16} height={16} className="shrink-0 text-fg-faint" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="할 일 추가"
        aria-label="할 일 추가"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-faint"
      />
      <div className="flex shrink-0 gap-1">
        {(
          [
            ["none", "마감 없음"],
            ["today", "오늘"],
            ["tomorrow", "내일"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setDue(key)}
            aria-pressed={due === key}
            className={`rounded-full px-2 py-0.5 text-xs ${
              due === key ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-hover"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </form>
  );
}
