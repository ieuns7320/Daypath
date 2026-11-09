"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { newId, useScoped, useStore } from "@/lib/data/store";
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
import {
  DAY_NAMES,
  describeRule,
  formatRule,
  occurrenceOn,
  parseRule,
  presetLabel,
  presetOf,
  presetRule,
  type Freq,
  type RecurrenceRule,
  type RepeatPreset,
} from "@/lib/recurrence";
import { deleteOccurrence, updateOccurrence, type Scope } from "@/lib/series";
import type { CalendarEvent, Task } from "@/lib/types";
import { HashIcon, XIcon } from "../icons";
import { ScopeDialog } from "./scope-dialog";

/**
 * 편집 창을 여는 대상.
 * - new: 새 일정 (캘린더). 새 할 일은 할 일 탭 목록에서 바로 추가한다.
 * - event / task: 기존 항목 수정
 */
export type EditorTarget =
  | { kind: "new"; start: Date; end: Date; allDay: boolean }
  /** occurrenceDate: 반복 일정의 어느 회차를 눌렀는지 "YYYY-MM-DD" */
  | { kind: "event"; id: string; occurrenceDate?: string }
  | { kind: "task"; id: string };

const inputCls =
  "rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-fg-muted";

/** 일정·할 일 추가/수정 창. 데스크톱은 가운데 팝업, 모바일은 아래에서 올라오는 시트. */
export function ItemEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const store = useStore();

  const existingEvent = target.kind === "event" ? store.events.find((e) => e.id === target.id) : undefined;
  const existingTask = target.kind === "task" ? store.tasks.find((t) => t.id === target.id) : undefined;
  const isNew = target.kind === "new";
  // 일정은 캘린더용, 할 일은 할 일용 카테고리·태그
  const { categories, tags } = useScoped(target.kind === "task" ? "task" : "event");
  // 반복 일정의 한 회차를 열었을 때
  const occDate = target.kind === "event" && existingEvent?.rrule ? target.occurrenceDate : undefined;
  const occurrence = existingEvent && occDate ? occurrenceOn(existingEvent, occDate) : null;
  // "이 일정만" 고쳐서 떼어 낸 회차 (반복 설정은 원래 반복 일정에서만 바꾼다)
  const isDetached = !!existingEvent?.series_id;

  /* ---------- 초기값 ---------- */
  const init = (() => {
    const base = existingEvent ?? existingTask;
    const draft = isNew ? (target as Extract<EditorTarget, { kind: "new" }>) : null;

    // 일정 시간 (종일 일정의 끝은 "다음 날 자정"이므로 화면에는 하루 빼서 표시)
    let evStart: Date;
    let evEnd: Date;
    let evAllDay: boolean;
    if (existingEvent) {
      // 반복 회차면 그 회차의 시각을 보여 준다
      evStart = occurrence?.start ?? new Date(existingEvent.start_at);
      const rawEnd = occurrence?.end ?? new Date(existingEvent.end_at);
      evAllDay = existingEvent.all_day;
      evEnd = evAllDay ? addDays(rawEnd, -1) : rawEnd;
    } else if (draft) {
      evStart = draft.start;
      evAllDay = draft.allDay;
      evEnd = draft.allDay ? addDays(draft.end, -1) : draft.end;
    } else {
      evStart = nextHour();
      evEnd = addMinutes(evStart, 60);
      evAllDay = false;
    }

    // 할 일: 하는 날 (due_date 칸)
    const day = existingTask?.due_date ?? null;

    const rule = parseRule(existingEvent?.rrule);
    return {
      rule,
      preset: presetOf(rule, evStart),
      type: (existingTask ? "task" : "event") as "event" | "task",
      title: base?.title ?? "",
      // 다른 쪽(캘린더 ↔ 할 일) 카테고리·태그가 남아 있으면 떼고 시작한다
      categoryId: base
        ? categories.some((c) => c.id === base.category_id)
          ? base.category_id
          : null
        : (categories[0]?.id ?? null),
      tagIds: (base?.tag_ids ?? []).filter((id) => tags.some((t) => t.id === id)),
      memo: base?.memo ?? "",
      evAllDay,
      evStartDate: toDateInput(evStart),
      evStartTime: toTimeInput(evStart),
      evEndDate: toDateInput(evEnd),
      evEndTime: toTimeInput(evEnd),
      done: existingTask?.done ?? false,
      hasDay: day !== null,
      day: day ?? todayInput(),
    };
  })();

  const type = init.type;
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
  const [hasDay, setHasDay] = useState(init.hasDay);
  const [day, setDay] = useState(init.day);
  // 반복
  const [preset, setPreset] = useState<RepeatPreset>(init.preset);
  const [custom, setCustom] = useState<RecurrenceRule>(
    init.rule ?? { freq: "WEEKLY", interval: 1, byday: [], until: null, count: null },
  );
  // 반복 설정을 직접 건드렸는지 (안 건드렸으면 기존 규칙을 그대로 쓰고, 날짜를 옮긴 만큼만 따라 옮긴다)
  const [ruleTouched, setRuleTouched] = useState(false);
  // 반복 일정 저장·삭제 전에 범위를 묻는 중
  const [pending, setPending] = useState<
    { action: "save"; next: CalendarEvent; allowThis: boolean } | { action: "delete" } | null
  >(null);

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

  /* ---------- 저장 / 삭제 ---------- */
  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim() || "(제목 없음)";
    const now = new Date().toISOString();

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
        rrule: isDetached
          ? null
          : existingEvent && !ruleTouched
            ? existingEvent.rrule
            : buildRule(start),
        exdates: existingEvent?.exdates ?? [],
        series_id: existingEvent?.series_id ?? null,
        original_date: existingEvent?.original_date ?? null,
      };
      if (existingEvent && occDate) {
        // 반복 회차: 범위를 물은 뒤 저장 (규칙을 바꿨으면 "이 일정만"은 없음)
        setPending({ action: "save", next: event, allowThis: !ruleTouched });
        return;
      }
      onClose();
      await store.saveEvent(event);
    } else {
      // 할 일 편집은 기존 항목만 (새 할 일은 할 일 탭에서 바로 추가)
      if (!existingTask) return onClose();
      const task: Task = {
        ...existingTask,
        title: name,
        due_date: hasDay ? day : null,
        done,
        done_at: done ? (existingTask.done_at ?? now) : null,
        category_id: categoryId,
        tag_ids: tagIds,
        memo,
      };
      onClose();
      await store.saveTask(task);
    }
  }

  async function remove() {
    if (existingEvent && occDate) {
      setPending({ action: "delete" });
      return;
    }
    onClose();
    if (existingEvent) await store.deleteEvent(existingEvent.id);
    if (existingTask) await store.deleteTask(existingTask.id);
  }

  /** 범위를 고른 뒤 반복 일정에 적용 */
  async function applyScope(scope: Scope) {
    if (!existingEvent || !occDate || !pending) return;
    const changes =
      pending.action === "save"
        ? updateOccurrence(store.events, existingEvent, occDate, scope, pending.next, newId)
        : deleteOccurrence(store.events, existingEvent, occDate, scope);
    setPending(null);
    onClose();
    await store.applyEventChanges(changes);
  }

  /** 편집 창의 반복 설정 → 규칙 문자열 */
  function buildRule(start: Date): string | null {
    if (preset === "none") return null;
    if (preset !== "custom") return formatRule(presetRule(preset, start)!);
    return formatRule({
      ...custom,
      byday: custom.freq === "WEEKLY" ? (custom.byday.length ? custom.byday : [start.getDay()]) : [],
    });
  }

  function changePreset(next: RepeatPreset) {
    setRuleTouched(true);
    if (next === "custom" && preset !== "custom") {
      // 빠른 선택에서 사용자 지정으로: 지금 선택을 출발점으로
      const start = fromInputs(startDate, startTime);
      setCustom(
        presetRule(preset, start) ?? {
          freq: "WEEKLY",
          interval: 1,
          byday: [start.getDay()],
          until: null,
          count: null,
        },
      );
    }
    setPreset(next);
  }

  function changeCustom(patch: Partial<RecurrenceRule>) {
    setRuleTouched(true);
    setCustom((c) => ({ ...c, ...patch }));
  }

  const heading = isNew ? "새 일정" : type === "event" ? "일정 수정" : "할 일 수정";

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
          <span className="text-sm font-medium text-fg-muted">{heading}</span>
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
              {isDetached ? (
                <p className="pl-14 text-xs text-fg-faint">
                  반복 일정에서 이 회차만 따로 고친 일정이에요.
                </p>
              ) : (
                <RepeatField
                  start={fromInputs(startDate, startTime)}
                  preset={preset}
                  custom={custom}
                  onPreset={changePreset}
                  onCustom={changeCustom}
                />
              )}
            </div>
          ) : (
            /* ---------- 할 일: 하는 날 (없을 수도 있음) ---------- */
            <Row label="날짜">
              {hasDay ? (
                <>
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => e.target.value && setDay(e.target.value)}
                    className={inputCls}
                  />
                  <ClearButton label="날짜 없애기" onClick={() => setHasDay(false)} />
                </>
              ) : (
                <AddButton onClick={() => setHasDay(true)}>날짜 정하기</AddButton>
              )}
            </Row>
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
      {pending && (
        <ScopeDialog
          action={pending.action}
          allowThis={pending.action === "delete" || pending.allowThis}
          onChoose={(scope) => void applyScope(scope)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>,
    document.body,
  );
}

const FREQ_UNITS: { freq: Freq; unit: string }[] = [
  { freq: "DAILY", unit: "일" },
  { freq: "WEEKLY", unit: "주" },
  { freq: "MONTHLY", unit: "개월" },
  { freq: "YEARLY", unit: "년" },
];

const PRESETS: RepeatPreset[] = ["none", "daily", "weekly", "monthly", "yearly", "custom"];

/** 반복: 빠른 선택 + 사용자 지정(간격·요일·종료) */
function RepeatField({
  start,
  preset,
  custom,
  onPreset,
  onCustom,
}: {
  start: Date;
  preset: RepeatPreset;
  custom: RecurrenceRule;
  onPreset: (p: RepeatPreset) => void;
  onCustom: (patch: Partial<RecurrenceRule>) => void;
}) {
  const endType = custom.until ? "until" : custom.count ? "count" : "none";
  const days = custom.byday.length ? custom.byday : [start.getDay()];
  const clamp = (v: string, max: number) => Math.min(max, Math.max(1, Number(v) || 1));

  return (
    <div className="space-y-2">
      <Row label="반복">
        <select
          value={preset}
          onChange={(e) => onPreset(e.target.value as RepeatPreset)}
          className={inputCls}
          aria-label="반복"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {presetLabel(p, start)}
            </option>
          ))}
        </select>
      </Row>

      {preset === "custom" && (
        <div className="ml-14 space-y-2.5 rounded-lg border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={99}
              value={custom.interval}
              onChange={(e) => onCustom({ interval: clamp(e.target.value, 99) })}
              className={`${inputCls} w-16`}
              aria-label="간격"
            />
            <select
              value={custom.freq}
              onChange={(e) => onCustom({ freq: e.target.value as Freq })}
              className={inputCls}
              aria-label="반복 단위"
            >
              {FREQ_UNITS.map((f) => (
                <option key={f.freq} value={f.freq}>
                  {f.unit}마다
                </option>
              ))}
            </select>
          </div>

          {custom.freq === "WEEKLY" && (
            <div className="flex gap-1" role="group" aria-label="요일">
              {DAY_NAMES.map((name, d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? days.filter((x) => x !== d) : [...days, d];
                      // 요일은 하나 이상 남긴다
                      if (next.length) onCustom({ byday: next.sort() });
                    }}
                    className={`size-8 rounded-full border text-xs ${
                      on
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-line text-fg-muted hover:border-line-strong"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-fg-faint">종료</span>
            <select
              value={endType}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none") onCustom({ until: null, count: null });
                if (v === "until") onCustom({ until: toDateInput(addDays(start, 30)), count: null });
                if (v === "count") onCustom({ until: null, count: 10 });
              }}
              className={inputCls}
              aria-label="종료"
            >
              <option value="none">없음</option>
              <option value="until">날짜까지</option>
              <option value="count">횟수</option>
            </select>
            {endType === "until" && (
              <input
                type="date"
                value={custom.until ?? ""}
                min={toDateInput(start)}
                onChange={(e) => e.target.value && onCustom({ until: e.target.value })}
                className={inputCls}
                aria-label="종료 날짜"
              />
            )}
            {endType === "count" && (
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={custom.count ?? 1}
                  onChange={(e) => onCustom({ count: clamp(e.target.value, 999) })}
                  className={`${inputCls} w-16`}
                  aria-label="반복 횟수"
                />
                <span className="text-fg-muted">회</span>
              </span>
            )}
          </div>

          <p className="text-xs text-fg-faint">{describeRule({ ...custom, byday: days }, start)}</p>
        </div>
      )}
    </div>
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
