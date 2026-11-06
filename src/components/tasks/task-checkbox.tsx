"use client";

import { CheckIcon } from "../icons";

/** 할 일 완료 체크박스. 캘린더 블록 안에서도 쓰이므로 data-task-check로 클릭을 구분한다. */
export function TaskCheckbox({
  done,
  onToggle,
  size = 18,
  color,
}: {
  done: boolean;
  onToggle?: () => void;
  size?: number;
  /** 테두리·채움 색 (기본: 글자색) */
  color?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "완료 취소" : "완료"}
      data-task-check=""
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex shrink-0 items-center justify-center rounded-[5px] border-[1.5px]"
      style={{
        width: size,
        height: size,
        borderColor: color ?? "currentColor",
        background: done ? (color ?? "currentColor") : "transparent",
      }}
    >
      {done && <CheckIcon width={size - 6} height={size - 6} style={{ color: "var(--bg)" }} />}
    </button>
  );
}
