"use client";

import { useEffect, useRef, useState } from "react";
import { useScoped, useStore } from "@/lib/data/store";
import { dueLabel, todayInput } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import type { Task } from "@/lib/types";
import { MoreIcon } from "../icons";
import { nextDay } from "./mini-month";
import { TaskCheckbox } from "./task-checkbox";

/**
 * 할 일 한 줄: 체크 · 제목 · 태그(● 이름) · ⋯ 메뉴.
 * 제목을 누르면 편집 창, ⋯ 메뉴에서 날짜 옮기기·삭제.
 */
export function TaskRow({
  task,
  onOpen,
  showDate = false,
}: {
  task: Task;
  onOpen: () => void;
  /** 밀린 할 일처럼 원래 날짜를 함께 보여 줄 때 */
  showDate?: boolean;
}) {
  const { toggleTask, saveTask, deleteTask } = useStore();
  const { categories, tags } = useScoped("task");
  const category = categories.find((c) => c.id === task.category_id);
  const taskTags = tags.filter((t) => task.tag_ids.includes(t.id));
  const today = todayInput();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc면 메뉴 닫기
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const moveTo = (date: string) => {
    setMenu(false);
    void saveTask({ ...task, due_date: date });
  };

  return (
    <div className="group relative flex items-start gap-3 rounded-md px-2 py-2 hover:bg-bg-hover">
      <span className="pt-0.5">
        <TaskCheckbox
          done={task.done}
          onToggle={() => void toggleTask(task.id)}
          size={20}
          color={category ? colorVar(category.color) : undefined}
        />
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={`truncate text-[15px] ${task.done ? "text-fg-faint line-through" : ""}`}>
          {task.title}
        </p>
        {(taskTags.length > 0 || (showDate && task.due_date)) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-fg-muted">
            {showDate && task.due_date && <span className="text-danger">{dueLabel(task.due_date)}</span>}
            {taskTags.map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <span className="size-[7px] rounded-full" style={{ background: colorVar(t.color) }} />
                {t.name}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* 밀린 할 일은 바로 "오늘로" */}
      {showDate && (
        <button
          onClick={() => moveTo(today)}
          className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-fg-muted hover:border-line-strong hover:text-fg"
        >
          오늘로
        </button>
      )}

      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenu(!menu)}
          aria-label="더 보기"
          aria-expanded={menu}
          className="rounded-md p-1 text-fg-faint hover:bg-bg hover:text-fg"
        >
          <MoreIcon width={18} height={18} />
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-line bg-bg py-1 text-sm shadow-lg"
          >
            <MenuItem onClick={() => (setMenu(false), onOpen())}>수정</MenuItem>
            {task.due_date !== today && <MenuItem onClick={() => moveTo(today)}>오늘 하기</MenuItem>}
            <MenuItem onClick={() => moveTo(nextDay(task.due_date && task.due_date > today ? task.due_date : today))}>
              {task.due_date && task.due_date > today ? "다음 날로" : "내일 하기"}
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                setMenu(false);
                void deleteTask(task.id);
              }}
            >
              삭제
            </MenuItem>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-bg-hover ${danger ? "text-danger" : ""}`}
    >
      {children}
    </button>
  );
}
