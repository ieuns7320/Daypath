"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { newId, useStore } from "@/lib/data/store";
import {
  addDays,
  addMinutes,
  fromInputs,
  nextHour,
  toDateInput,
  toTimeInput,
  todayInput,
} from "@/lib/date";
import { colorVar } from "@/lib/palette";
import type { CalendarEvent, Task } from "@/lib/types";
import { HashIcon, XIcon } from "../icons";

/**
 * 편집 창을 여는 대상.
 * - new: 새로 만들기 (type으로 일정/할 일 중 처음 보여줄 탭을 정함)
 * - event / task: 기존 항목 수정
 */
export type EditorTarget =
  | { kind: "new"; type: "event" | "task"; start: Date; end: Date; allDay: boolean }
  | { kind: "event"; id: string }
  | { kind: "task"; id: string };

/** 새 할 일 초안: 마감일·작업 시간 없이 시작 */
export function newTaskTarget(): EditorTarget {
  const start = nextHour();
  return { kind: "new", type: "task", start, end: addMinutes(start, 60), allDay: true };
}

const inputCls =
  "rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-fg-muted";

/** 일정·할 일 추가/수정 창. 데스크톱은 가운데 팝업, 모바일은 아래에서 올라오는 시트. */
export function ItemEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const store = useStore();
  const { categories, tags } = store;

  const existingEvent = target.kind === "event" ? store.events.find((e) => e.id === target.id) : undefined;
  const existingTask = target.kind === "task" ? store.tasks.find((t) => t.id === target.id) : undefined;
  const isNew = target.kind === "new";

  /* ---------- 초기값 ---------- */
  const init = (() => {
    const base = existingEvent ?? existingTask;
    const draft = isNew ? (target as Extract<EditorTarget, { kind: "new" }>) : null;

    // 일정 시간 (종일 일정의 끝은 "다음 날 자정"이므로 화면에는 하루 빼서 표시)
    let evStart: Date;
    let evEnd: Date;
    let evAllDay: boolean;
    if (existingEvent) {
      evStart = new Date(existingEvent.start_at);
      evAllDay = existingEvent.all_day;
      evEnd = evAllDay ? addDays(new Date(existingEvent.end_at), -1) : new Date(existingEvent.end_at);
    } else if (draft) {
      evStart = draft.start;
      evAllDay = draft.allDay;
      evEnd = draft.allDay ? addDays(draft.end, -1) : draft.end;
    } else {
      evStart = nextHour();
      evEnd = addMinutes(evStart, 60);
      evAllDay = false;
    }

    // 할 일: 마감일 / 작업 시간
    let due: string | null = null;
    let sched: { start: Date; end: Date } | null = null;
    if (existingTask) {
      due = existingTask.due_date;
      if (existingTask.scheduled_start && existingTask.scheduled_end)
        sched = {
          start: new Date(existingTask.scheduled_start),
          end: new Date(existingTask.scheduled_end),
        };
    } else if (draft && draft.type === "event") {
      // 캘린더에서 고른 범위를 할 일로 바꾸면: 그 날을 마감일로, 시간 범위면 작업 시간으로
      due = toDateInput(draft.start);
      if (!draft.allDay) sched = { start: draft.start, end: draft.end };
    }
    const schedStart = sched?.start ?? nextHour();
    const schedEnd = sched?.end ?? addMinutes(schedStart, 60);

    return {
      type: (existingTask ? "task" : existingEvent ? "event" : draft!.type) as "event" | "task",
      title: base?.title ?? "",
      categoryId: base ? base.category_id : (categories[0]?.id ?? null),
      tagIds: base?.tag_ids ?? [],
      memo: base?.memo ?? "",
      evAllDay,
      evStartDate: toDateInput(evStart),
      evStartTime: toTimeInput(evStart),
      evEndDate: toDateInput(evEnd),
      evEndTime: toTimeInput(evEnd),
      done: existingTask?.done ?? false,
      hasDue: due !== null,
      dueDate: due ?? todayInput(),
      hasSched: sched !== null,
      schedDate: toDateInput(schedStart),
      schedStart: toTimeInput(schedStart),
      schedEnd: toTimeInput(schedEnd),
    };
  })();

  const [type, setType] = useState(init.type);
  const [title, setTitle] = useState(init.title);
  const [categoryId, setCategoryId] = useState<string | null>(init.categoryId);
  const [tagIds, setTagIds] = useState<string[]>(init.tagIds);
  const [memo, setMemo] = useState(init.memo);
  // 일정
  const [allDay, setAllDay] = useState(init.evAllDay);
  const [startDate, setStartDate] = useState(init.evStartDate);
  const [startTime, setStartTime] = useState(init.evStartTime);
  const [endDate, setEndDate] = useState(init.evEndDate);
  const [endTime, setEndTime] = useState(init.evEndTime);
  // 할 일
  const [done, setDone] = useState(init.done);
  const [hasDue, setHasDue] = useState(init.hasDue);
  const [dueDate, setDueDate] = useState(init.dueDate);
  const [hasSched, setHasSched] = useState(init.hasSched);
  const [schedDate, setSchedDate] = useState(init.schedDate);
  const [schedStart, setSchedStart] = useState(init.schedStart);
  const [schedEnd, setSchedEnd] = useState(init.schedEnd);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isNew) titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isNew]);

  // 일정 시작을 바꾸면 길이를 유지하며 끝도 함께 이동
  function changeEventStart(date: string, time: string) {
    const duration = Math.max(
      fromInputs(endDate, endTime).getTime() - fromInputs(startDate, startTime).getTime(),
      0,
    );
    const newEnd = new Date(fromInputs(date, time).getTime() + duration);
    setStartDate(date);
    setStartTime(time);
    setEndDate(toDateInput(newEnd));
    setEndTime(toTimeInput(newEnd));
  }

  // 작업 시간 시작을 바꾸면 길이 유지
  function changeSchedStart(time: string) {
    const duration = Math.max(
      fromInputs(schedDate, schedEnd).getTime() - fromInputs(schedDate, schedStart).getTime(),
      15 * 60_000,
    );
    setSchedStart(time);
    setSchedEnd(toTimeInput(new Date(fromInputs(schedDate, time).getTime() + duration)));
  }

  /* ---------- 저장 / 삭제 ---------- */
  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim() || "(제목 없음)";
    const now = new Date().toISOString();
    onClose();

    if (type === "event") {
      let start: Date;
      let end: Date;
      if (allDay) {
        start = fromInputs(startDate);
        end = addDays(fromInputs(endDate < startDate ? startDate : endDate), 1);
      } else {
        start = fromInputs(startDate, startTime);
        end = fromInputs(endDate, endTime);
        if (end <= start) end = addMinutes(start, 60);
      }
      const event: CalendarEvent = {
        id: existingEvent?.id ?? newId(),
        title: name,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        all_day: allDay,
        category_id: categoryId,
        tag_ids: tagIds,
        memo,
      };
      await store.saveEvent(event);
    } else {
      let sStart: string | null = null;
      let sEnd: string | null = null;
      if (hasSched) {
        const s = fromInputs(schedDate, schedStart);
        let en = fromInputs(schedDate, schedEnd);
        if (en <= s) en = addMinutes(s, 60);
        sStart = s.toISOString();
        sEnd = en.toISOString();
      }
      const task: Task = {
        id: existingTask?.id ?? newId(),
        title: name,
        due_date: hasDue ? dueDate : null,
        scheduled_start: sStart,
        scheduled_end: sEnd,
        done,
        done_at: done ? (existingTask?.done_at ?? now) : null,
        category_id: categoryId,
        tag_ids: tagIds,
        memo,
        created_at: existingTask?.created_at ?? now,
      };
      await store.saveTask(task);
    }
  }

  async function remove() {
    onClose();
    if (existingEvent) await store.deleteEvent(existingEvent.id);
    if (existingTask) await store.deleteTask(existingTask.id);
  }

  const heading = isNew ? null : type === "event" ? "일정 수정" : "할 일 수정";

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
          {heading ? (
            <span className="text-sm font-medium text-fg-muted">{heading}</span>
          ) : (
            <div className="flex rounded-lg bg-bg-hover p-0.5" role="tablist" aria-label="종류">
              {(["event", "task"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={type === t}
                  onClick={() => setType(t)}
                  className={`rounded-md px-3 py-1 text-sm ${
                    type === t ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted"
                  }`}
                >
                  {t === "event" ? "일정" : "할 일"}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="닫기" className="text-fg-muted hover:text-fg">
            <XIcon />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="flex items-center gap-3">
            {type === "task" && !isNew && (
              <input
                type="checkbox"
                checked={done}
                onChange={(e) => setDone(e.target.checked)}
                aria-label="완료"
                className="size-5 shrink-0 accent-[var(--accent)]"
              />
            )}
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "event" ? "일정 제목" : "할 일"}
              className={`w-full border-0 border-b border-line bg-transparent pb-2 text-lg outline-none placeholder:text-fg-faint focus:border-fg-muted ${
                done && type === "task" ? "text-fg-muted line-through" : ""
              }`}
            />
          </div>

          {type === "event" ? (
            /* ---------- 일정: 시작·종료·종일 ---------- */
            <div className="space-y-2">
              <Row label="시작">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => e.target.value && changeEventStart(e.target.value, startTime)}
                  className={inputCls}
                />
                {!allDay && (
                  <input
                    type="time"
                    step={300}
                    value={startTime}
                    onChange={(e) => e.target.value && changeEventStart(startDate, e.target.value)}
                    className={inputCls}
                  />
                )}
              </Row>
              <Row label="종료">
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
              </Row>
              <label className="flex w-fit cursor-pointer items-center gap-2 pl-14 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                종일
              </label>
            </div>
          ) : (
            /* ---------- 할 일: 마감일 · 작업 시간 (둘 다 선택) ---------- */
            <div className="space-y-2">
              <Row label="마감일">
                {hasDue ? (
                  <>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => e.target.value && setDueDate(e.target.value)}
                      className={inputCls}
                    />
                    <ClearButton label="마감일 없애기" onClick={() => setHasDue(false)} />
                  </>
                ) : (
                  <AddButton onClick={() => setHasDue(true)}>마감일 추가</AddButton>
                )}
              </Row>
              <Row label="작업 시간">
                {hasSched ? (
                  <>
                    <input
                      type="date"
                      value={schedDate}
                      onChange={(e) => e.target.value && setSchedDate(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="time"
                      step={300}
                      value={schedStart}
                      onChange={(e) => e.target.value && changeSchedStart(e.target.value)}
                      className={inputCls}
                    />
                    <span className="text-fg-faint">–</span>
                    <input
                      type="time"
                      step={300}
                      value={schedEnd}
                      onChange={(e) => e.target.value && setSchedEnd(e.target.value)}
                      className={inputCls}
                    />
                    <ClearButton label="작업 시간 없애기" onClick={() => setHasSched(false)} />
                  </>
                ) : (
                  <AddButton onClick={() => setHasSched(true)}>캘린더에 시간 배정</AddButton>
                )}
              </Row>
            </div>
          )}

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
                  <Chip
                    key={t.id}
                    selected={tagIds.includes(t.id)}
                    onClick={() =>
                      setTagIds((prev) =>
                        prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                      )
                    }
                  >
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
          {!isNew ? (
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-fg-faint">{label}</span>
      {children}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-dashed border-line px-2.5 py-1.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
    >
      + {children}
    </button>
  );
}

function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-fg-faint hover:text-fg"
    >
      <XIcon width={16} height={16} />
    </button>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
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
