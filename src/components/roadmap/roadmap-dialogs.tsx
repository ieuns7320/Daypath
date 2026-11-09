"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { newId, useStore } from "@/lib/data/store";
import { COLOR_KEYS, COLOR_LABELS, colorVar, type ColorKey } from "@/lib/palette";
import type { Goal, Milestone } from "@/lib/types";
import { XIcon } from "../icons";

const inputCls =
  "rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-fg-muted";

/** 목표·마일스톤 편집 창 공통 틀 (데스크톱 가운데 팝업, 모바일 아래 시트) */
function Dialog({
  heading,
  onClose,
  onSubmit,
  children,
  footer,
}: {
  heading: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] md:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-xl md:max-w-md md:rounded-xl md:pb-0"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm font-medium text-fg-muted">{heading}</span>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-fg-muted hover:text-fg">
            <XIcon />
          </button>
        </div>
        <div className="space-y-5 px-5 py-4">{children}</div>
        <div className="flex items-center gap-3 border-t border-line px-5 py-3">{footer}</div>
      </form>
    </div>,
    document.body,
  );
}

function TitleInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-0 border-b border-line bg-transparent pb-2 text-lg outline-none placeholder:text-fg-faint focus:border-fg-muted"
    />
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 날짜 (선택): 날짜 입력 + 지우기, 없으면 "+ 목표일 정하기" */
function DateField({
  value,
  onChange,
  label = "목표일",
  initial,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  /** "+ 정하기"를 눌렀을 때 처음 값 (기본은 한 달 뒤) */
  initial?: () => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-fg-faint">{label}</span>
      {value ? (
        <>
          <input
            type="date"
            value={value}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`${label} 없애기`}
            className="rounded p-1 text-fg-faint hover:text-fg"
          >
            <XIcon width={16} height={16} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (initial) return onChange(initial());
            // 기본은 한 달 뒤
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            onChange(dateInput(d));
          }}
          className="rounded-md border border-dashed border-line px-2.5 py-1.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          + {label} 정하기
        </button>
      )}
    </div>
  );
}

/** 삭제: 한 번 누르면 안내 + [취소] [삭제] (브라우저 confirm() 대신) */
function DeleteButton({ message, onDelete }: { message: string; onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-sm text-danger hover:opacity-80">
        삭제
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
      {message}
      <button type="button" onClick={() => setAsking(false)} className="rounded border border-line px-2 py-0.5">
        취소
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded border border-danger px-2 py-0.5 text-danger"
      >
        삭제
      </button>
    </span>
  );
}

const SaveButton = () => (
  <button
    type="submit"
    className="ml-auto rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
  >
    저장
  </button>
);

/* ---------- 목표 ---------- */

export function GoalDialog({
  goal,
  onClose,
  onCreated,
}: {
  /** 없으면 새 목표 */
  goal?: Goal;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { goals, saveGoal, deleteGoal } = useStore();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [color, setColor] = useState<ColorKey>(goal?.color ?? "blue");
  const [start, setStart] = useState<string | null>(goal?.start_date ?? null);
  const [target, setTarget] = useState<string | null>(goal?.target_date ?? null);
  const [memo, setMemo] = useState(goal?.memo ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const id = goal?.id ?? newId();
    // 시작일이 목표일보다 늦으면 서로 바꾼다
    const [s, t] = start && target && start > target ? [target, start] : [start, target];
    void saveGoal({
      id,
      title: title.trim() || "(제목 없음)",
      color,
      start_date: s,
      target_date: t,
      memo,
      archived: goal?.archived ?? false,
      sort_order: goal?.sort_order ?? goals.length,
      created_at: goal?.created_at ?? new Date().toISOString(),
    });
    if (!goal) onCreated?.(id);
    onClose();
  }

  return (
    <Dialog
      heading={goal ? "목표 수정" : "새 목표"}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {goal && (
            <>
              <DeleteButton
                message="목표와 마일스톤을 지워요. 연결된 할 일·일정은 남아요."
                onDelete={() => {
                  onClose();
                  void deleteGoal(goal.id);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void saveGoal({ ...goal, archived: !goal.archived });
                }}
                className="text-sm text-fg-muted hover:text-fg"
              >
                {goal.archived ? "보관 해제" : "보관"}
              </button>
            </>
          )}
          <SaveButton />
        </>
      }
    >
      <TitleInput value={title} onChange={setTitle} placeholder="목표 (예: 토익 900점)" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 shrink-0 text-xs text-fg-faint">색</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="색">
          {COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={COLOR_LABELS[c]}
              title={COLOR_LABELS[c]}
              onClick={() => setColor(c)}
              className={`size-6 rounded-full border-2 ${color === c ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
              style={{ borderColor: colorVar(c) }}
            />
          ))}
        </div>
      </div>
      <DateField value={start} onChange={setStart} label="시작일" initial={() => dateInput(new Date())} />
      <DateField value={target} onChange={setTarget} />
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (왜 이 목표인지, 기준 등)"
        rows={3}
        className="w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-fg-muted"
      />
    </Dialog>
  );
}

/* ---------- 마일스톤 ---------- */

export function MilestoneDialog({ milestone, onClose }: { milestone: Milestone; onClose: () => void }) {
  const { saveMilestone, deleteMilestone } = useStore();
  const [title, setTitle] = useState(milestone.title);
  const [target, setTarget] = useState<string | null>(milestone.target_date);

  function submit(e: FormEvent) {
    e.preventDefault();
    void saveMilestone({ ...milestone, title: title.trim() || "(제목 없음)", target_date: target });
    onClose();
  }

  return (
    <Dialog
      heading="마일스톤 수정"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <DeleteButton
            message="마일스톤을 지워요. 연결된 할 일·일정은 남아요."
            onDelete={() => {
              onClose();
              void deleteMilestone(milestone.id);
            }}
          />
          <SaveButton />
        </>
      }
    >
      <TitleInput value={title} onChange={setTitle} placeholder="마일스톤" />
      <DateField value={target} onChange={setTarget} />
    </Dialog>
  );
}
