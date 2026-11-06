import { endOfWeekInput, todayInput } from "./date";
import type { Task } from "./types";

export type TaskGroupKey = "overdue" | "today" | "week" | "later" | "nodue" | "done";

export const TASK_GROUPS: { key: TaskGroupKey; label: string }[] = [
  { key: "overdue", label: "지난 마감" },
  { key: "today", label: "오늘" },
  { key: "week", label: "이번 주" },
  { key: "later", label: "이후" },
  { key: "nodue", label: "마감일 없음" },
  { key: "done", label: "완료됨" },
];

export type TaskSort = "due" | "created";

/** 마감일 기준으로 할 일을 묶는다. 한 주는 일요일~토요일. */
export function groupTasks(tasks: Task[], sort: TaskSort): Record<TaskGroupKey, Task[]> {
  const today = todayInput();
  const weekEnd = endOfWeekInput(today);
  const groups: Record<TaskGroupKey, Task[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    nodue: [],
    done: [],
  };

  for (const t of tasks) {
    if (t.done) groups.done.push(t);
    else if (!t.due_date) groups.nodue.push(t);
    else if (t.due_date < today) groups.overdue.push(t);
    else if (t.due_date === today) groups.today.push(t);
    else if (t.due_date <= weekEnd) groups.week.push(t);
    else groups.later.push(t);
  }

  const byCreatedDesc = (a: Task, b: Task) => b.created_at.localeCompare(a.created_at);
  const byDue = (a: Task, b: Task) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    (a.scheduled_start ?? "~").localeCompare(b.scheduled_start ?? "~") ||
    a.created_at.localeCompare(b.created_at);

  for (const key of Object.keys(groups) as TaskGroupKey[]) {
    if (key === "done") {
      groups.done.sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    } else {
      groups[key].sort(sort === "due" ? byDue : byCreatedDesc);
    }
  }
  return groups;
}
