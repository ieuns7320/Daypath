import type { Category, Task } from "./types";

/*
 * 할 일 탭 계산 도우미.
 * 할 일의 날짜(`due_date` 칸)는 "그 일을 하는 날"이다. 마감일이 아니다.
 */

/** 날짜별 완료 현황 (미니 캘린더의 진행률 링) */
export function dayStats(tasks: Task[]): Map<string, { done: number; total: number }> {
  const stats = new Map<string, { done: number; total: number }>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const s = stats.get(t.due_date) ?? { done: 0, total: 0 };
    s.total += 1;
    if (t.done) s.done += 1;
    stats.set(t.due_date, s);
  }
  return stats;
}

/** 밀린 할 일: 오늘 이전 날짜인데 아직 못 끝낸 것 (오래된 날짜 먼저) */
export function carriedOver(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => !t.done && t.due_date !== null && t.due_date < today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || byCreated(a, b));
}

export type TaskGroup = { category: Category | null; tasks: Task[] };

/**
 * 카테고리별 묶음. 카테고리는 설정의 순서대로 모두 보여 준다(비어 있어도 + 로 추가할 수 있게).
 * "카테고리 없음"은 할 일이 있을 때만 맨 뒤에.
 */
export function groupByCategory(tasks: Task[], categories: Category[]): TaskGroup[] {
  const known = new Set(categories.map((c) => c.id));
  const groups: TaskGroup[] = categories.map((c) => ({
    category: c,
    tasks: tasks.filter((t) => t.category_id === c.id).sort(byCreated),
  }));
  const none = tasks.filter((t) => !t.category_id || !known.has(t.category_id)).sort(byCreated);
  if (none.length) groups.push({ category: null, tasks: none });
  return groups;
}

/** 만든 순서 (먼저 만든 것이 위) */
function byCreated(a: Task, b: Task): number {
  return a.created_at.localeCompare(b.created_at);
}
