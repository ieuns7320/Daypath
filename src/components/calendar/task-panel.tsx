"use client";

import { useEffect, useMemo, useRef } from "react";
import { Draggable } from "@fullcalendar/react/interaction";
import { useStore } from "@/lib/data/store";
import { groupTasks } from "@/lib/tasks";
import { TaskRow } from "../tasks/task-row";

/**
 * 데스크톱 캘린더 오른쪽 패널: 아직 작업 시간이 없는 할 일 목록.
 * 항목을 캘린더의 시간 칸에 끌어다 놓으면 작업 시간이 배정되고(타임 블로킹),
 * 종일 칸에 놓으면 그 날이 마감일이 된다.
 */
export function TaskPanel({ onOpen }: { onOpen: (taskId: string) => void }) {
  const { tasks, matchesFilter } = useStore();
  const listRef = useRef<HTMLDivElement>(null);

  const unscheduled = useMemo(() => {
    const g = groupTasks(
      tasks.filter((t) => !t.done && !t.scheduled_start && matchesFilter(t)),
      "due",
    );
    return [...g.overdue, ...g.today, ...g.week, ...g.later, ...g.nodue];
  }, [tasks, matchesFilter]);

  useEffect(() => {
    if (!listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: "[data-task-id]",
      longPressDelay: 250,
      eventData: (el: HTMLElement) => ({
        title: el.dataset.title ?? "",
        duration: "01:00",
        // 캘린더가 이벤트를 직접 만들지 않고, drop 콜백에서 할 일을 저장한다.
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, []);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-bg-subtle">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium">시간 배정 전 할 일</h2>
        <p className="mt-0.5 text-xs text-fg-faint">캘린더로 끌어다 놓으면 작업 시간이 잡혀요.</p>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {unscheduled.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-faint">모두 배정했어요.</p>
        ) : (
          unscheduled.map((t) => (
            <div key={t.id} data-task-id={t.id} data-title={t.title} className="cursor-grab">
              <TaskRow task={t} onOpen={() => onOpen(t.id)} />
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
