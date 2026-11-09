"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Scope } from "@/lib/series";

const OPTIONS: { scope: Scope; label: string }[] = [
  { scope: "this", label: "이 일정만" },
  { scope: "following", label: "이후 모든 일정" },
  { scope: "all", label: "전체 일정" },
];

/**
 * 반복 일정을 고치거나 지울 때 범위를 묻는 작은 창.
 * allowThis=false: 반복 규칙 자체를 바꾼 경우 ("이 일정만"은 뜻이 없음)
 */
export function ScopeDialog({
  action,
  allowThis = true,
  onChoose,
  onCancel,
}: {
  action: "save" | "delete";
  allowThis?: boolean;
  onChoose: (scope: Scope) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 편집 창의 Esc(닫기)까지 가지 않게 여기서 멈춘다
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--overlay)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scope-title"
        className="w-full max-w-xs rounded-xl border border-line bg-bg p-4 shadow-xl"
      >
        <h2 id="scope-title" className="mb-3 text-sm font-medium">
          {action === "delete" ? "반복 일정 삭제" : "반복 일정 수정"}
        </h2>
        <div className="space-y-1.5">
          {OPTIONS.filter((o) => allowThis || o.scope !== "this").map((o) => (
            <button
              key={o.scope}
              type="button"
              onClick={() => onChoose(o.scope)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-bg-hover ${
                action === "delete" ? "border-line text-danger" : "border-line"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-hover"
        >
          취소
        </button>
      </div>
    </div>,
    document.body,
  );
}
