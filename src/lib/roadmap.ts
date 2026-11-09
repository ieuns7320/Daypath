import { daysBetween, fromInputs, todayInput } from "./date";
import type { CalendarEvent, Goal, Milestone, Task } from "./types";

/**
 * 로드맵 계산.
 * - 마일스톤 진행률 = 연결된 할 일 중 완료 비율. 할 일이 없으면 직접 체크한 완료 표시(0 / 100%)
 * - 목표 진행률 = 마일스톤 진행률의 평균 (마일스톤마다 같은 비중). 마일스톤이 없으면 0
 * - 일정은 "관련 일정"으로 보여 주기만 하고 진행률에는 넣지 않는다
 */

export type MilestoneInfo = {
  milestone: Milestone;
  tasks: Task[];
  events: CalendarEvent[];
  /** 0~1 */
  progress: number;
  /** 다 끝났는지 (할 일이 모두 완료, 또는 할 일 없이 직접 완료 표시) */
  complete: boolean;
};

export type GoalInfo = {
  goal: Goal;
  milestones: MilestoneInfo[];
  progress: number;
  completeCount: number;
};

export function milestoneProgress(m: Milestone, tasks: Task[]): number {
  if (tasks.length === 0) return m.done ? 1 : 0;
  return tasks.filter((t) => t.done).length / tasks.length;
}

/** 마일스톤 순서: 목표일 빠른 순(없으면 맨 뒤) → 만든 순서 */
export function sortMilestones(list: Milestone[]): Milestone[] {
  return [...list].sort((a, b) => {
    if (a.target_date !== b.target_date) {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    }
    return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
  });
}

/** 할 일 순서: 안 끝난 것 먼저 → 날짜 빠른 순(없으면 뒤) → 만든 순서 */
function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return a.created_at.localeCompare(b.created_at);
  });
}

export function goalInfo(
  goal: Goal,
  milestones: Milestone[],
  tasks: Task[],
  events: CalendarEvent[],
): GoalInfo {
  const infos = sortMilestones(milestones.filter((m) => m.goal_id === goal.id)).map((m) => {
    const linked = tasks.filter((t) => t.milestone_id === m.id);
    const progress = milestoneProgress(m, linked);
    return {
      milestone: m,
      tasks: sortTasks(linked),
      events: events
        .filter((e) => e.milestone_id === m.id)
        .sort((a, b) => a.start_at.localeCompare(b.start_at)),
      progress,
      complete: progress === 1,
    };
  });
  const progress = infos.length ? infos.reduce((sum, i) => sum + i.progress, 0) / infos.length : 0;
  return {
    goal,
    milestones: infos,
    progress,
    completeCount: infos.filter((i) => i.complete).length,
  };
}

/** 목표 순서: 목표일 빠른 순(없으면 뒤) → 정렬 순서 → 만든 순서 */
export function sortGoals(list: Goal[]): Goal[] {
  return [...list].sort((a, b) => {
    if (a.target_date !== b.target_date) {
      if (!a.target_date) return 1;
      if (!b.target_date) return -1;
      return a.target_date.localeCompare(b.target_date);
    }
    return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
  });
}

/** "D-52" / "D-day" / "D+3" */
export function dDay(date: string, today = todayInput()): string {
  const n = daysBetween(today, date);
  if (n === 0) return "D-day";
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** "11/30" (올해가 아니면 "2027/1/5") */
export function shortDate(date: string, today = todayInput()): string {
  const d = fromInputs(date);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return date.slice(0, 4) === today.slice(0, 4) ? md : `${d.getFullYear()}/${md}`;
}

export const percent = (p: number) => `${Math.round(p * 100)}%`;
