"use client";

import { useStore } from "@/lib/data/store";
import { dueLabel, timeLabel, toDateInput, todayInput } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import type { Task } from "@/lib/types";
import { ClockIcon } from "../icons";
import { TaskCheckbox } from "./task-checkbox";

/** 할 일 한 줄: 체크 · 제목 · (카테고리, 태그, 작업 시간, 마감일) */
export function TaskRow({
  task,
  onOpen,
  showDue = true,
}: {
  task: Task;
  onOpen: () => void;
  showDue?: boolean;
}) {
  const { categories, tags, toggleTask } = useStore();
  const category = categories.find((c) => c.id === task.category_id);
  const taskTags = tags.filter((t) => task.tag_ids.includes(t.id));
  const overdue = !task.done && task.due_date !== null && task.due_date < todayInput();

  const hasMeta =
    category || taskTags.length > 0 || task.scheduled_start || (showDue && task.due_date);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className="group flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-bg-hover"
    >
      <span className="pt-0.5 text-fg-muted">
        <TaskCheckbox
          done={task.done}
          onToggle={() => void toggleTask(task.id)}
          color={category ? colorVar(category.color) : undefined}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${task.done ? "text-fg-faint line-through" : ""}`}>
          {task.title}
        </p>
        {hasMeta && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-fg-muted">
            {category && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-[2px]" style={{ background: colorVar(category.color) }} />
                {category.name}
              </span>
            )}
            {taskTags.map((t) => (
              <span key={t.id} style={{ color: colorVar(t.color) }}>
                #{t.name}
              </span>
            ))}
            {task.scheduled_start && task.scheduled_end && (
              <span className="flex items-center gap-1">
                <ClockIcon width={12} height={12} />
                {schedLabel(task.scheduled_start, task.scheduled_end)}
              </span>
            )}
            {showDue && task.due_date && (
              <span className={overdue ? "text-danger" : ""}>마감 {dueLabel(task.due_date)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function schedLabel(start: string, end: string): string {
  return `${dueLabel(toDateInput(new Date(start)))} ${timeLabel(start)}–${timeLabel(end)}`;
}
