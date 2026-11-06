"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { newId, useStore } from "@/lib/data/store";
import { addDays, addMinutes, fromInputs, toDateInput, toTimeInput } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import type { CalendarEvent } from "@/lib/types";
import { HashIcon, XIcon } from "../icons";

export type EditorTarget =
  | { kind: "new"; start: Date; end: Date; allDay: boolean }
  | { kind: "edit"; id: string };

/** 일정 추가·수정 창. 데스크톱은 가운데 팝업, 모바일은 아래에서 올라오는 시트. */
export function EventEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const { events, categories, tags, saveEvent, deleteEvent } = useStore();
  const existing = target.kind === "edit" ? events.find((e) => e.id === target.id) : undefined;

  const initial = (() => {
    if (existing) {
      const start = new Date(existing.start_at);
      // 종일 일정의 끝은 "다음 날 자정"으로 저장되므로 화면에는 하루 빼서 보여준다.
      const end = existing.all_day
        ? addDays(new Date(existing.end_at), -1)
        : new Date(existing.end_at);
      return { ...existing, start, end };
    }
    const t = target as Extract<EditorTarget, { kind: "new" }>;
    return {
      title: "",
      all_day: t.allDay,
      category_id: categories[0]?.id ?? null,
      tag_ids: [] as string[],
      memo: "",
      start: t.start,
      end: t.allDay ? addDays(t.end, -1) : t.end,
    };
  })();

  const [title, setTitle] = useState(initial.title);
  const [allDay, setAllDay] = useState(initial.all_day);
  const [startDate, setStartDate] = useState(toDateInput(initial.start));
  const [startTime, setStartTime] = useState(toTimeInput(initial.start));
  const [endDate, setEndDate] = useState(toDateInput(initial.end));
  const [endTime, setEndTime] = useState(toTimeInput(initial.end));
  const [categoryId, setCategoryId] = useState<string | null>(initial.category_id);
  const [tagIds, setTagIds] = useState<string[]>(initial.tag_ids);
  const [memo, setMemo] = useState(initial.memo);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (target.kind === "new") titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, target.kind]);

  // 시작을 바꾸면 기존 길이를 유지하며 끝도 함께 이동
  function changeStart(date: string, time: string) {
    const oldStart = fromInputs(startDate, startTime);
    const oldEnd = fromInputs(endDate, endTime);
    const duration = Math.max(oldEnd.getTime() - oldStart.getTime(), 0);
    const newStart = fromInputs(date, time);
    const newEnd = new Date(newStart.getTime() + duration);
    setStartDate(date);
    setStartTime(time);
    setEndDate(toDateInput(newEnd));
    setEndTime(toTimeInput(newEnd));
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    let start: Date;
    let end: Date;
    if (allDay) {
      start = fromInputs(startDate);
      const lastDay = fromInputs(endDate < startDate ? startDate : endDate);
      end = addDays(lastDay, 1);
    } else {
      start = fromInputs(startDate, startTime);
      end = fromInputs(endDate, endTime);
      if (end <= start) end = addMinutes(start, 60);
    }
    const event: CalendarEvent = {
      id: existing?.id ?? newId(),
      title: title.trim() || "(제목 없음)",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: allDay,
      category_id: categoryId,
      tag_ids: tagIds,
      memo,
    };
    onClose();
    await saveEvent(event);
  }

  async function remove() {
    if (!existing) return;
    onClose();
    await deleteEvent(existing.id);
  }

  const inputCls =
    "rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-fg-muted";

  // 캘린더 DOM 바깥(body)에 그려서 캘린더의 포인터 처리와 섞이지 않게 한다.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] md:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-xl md:max-w-md md:rounded-xl md:pb-0"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm font-medium text-fg-muted">
            {existing ? "일정 수정" : "새 일정"}
          </span>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-fg-muted hover:text-fg">
            <XIcon />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full border-0 border-b border-line bg-transparent pb-2 text-lg outline-none placeholder:text-fg-faint focus:border-fg-muted"
          />

          {/* 날짜·시간 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-8 text-xs text-fg-faint">시작</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => e.target.value && changeStart(e.target.value, startTime)}
                className={inputCls}
              />
              {!allDay && (
                <input
                  type="time"
                  step={300}
                  value={startTime}
                  onChange={(e) => e.target.value && changeStart(startDate, e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-8 text-xs text-fg-faint">종료</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => e.target.value && setEndDate(e.target.value)}
                className={inputCls}
              />
              {!allDay && (
                <input
                  type="time"
                  step={300}
                  value={endTime}
                  onChange={(e) => e.target.value && setEndTime(e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 pl-10 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              종일
            </label>
          </div>

          {/* 카테고리 (1개) */}
          <div>
            <p className="mb-2 text-xs text-fg-faint">카테고리</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip selected={categoryId === null} onClick={() => setCategoryId(null)}>
                없음
              </Chip>
              {categories.map((c) => (
                <Chip key={c.id} selected={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                  <span className="size-2.5 rounded-[3px]" style={{ background: colorVar(c.color) }} />
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>

          {/* 태그 (여러 개) */}
          <div>
            <p className="mb-2 text-xs text-fg-faint">태그</p>
            {tags.length === 0 ? (
              <p className="text-xs text-fg-faint">설정에서 태그를 추가할 수 있어요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Chip key={t.id} selected={tagIds.includes(t.id)} onClick={() => toggleTag(t.id)}>
                    <HashIcon width={12} height={12} style={{ color: colorVar(t.color) }} />
                    {t.name}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모"
            rows={2}
            className="w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-fg-muted"
          />
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          {existing ? (
            <button type="button" onClick={remove} className="text-sm text-danger hover:opacity-80">
              삭제
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            저장
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        selected
          ? "border-accent bg-accent text-accent-fg"
          : "border-line text-fg-muted hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}
