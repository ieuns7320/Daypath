"use client";

/*
 * 날짜·시각 선택기 (2026-11-10).
 * 브라우저 기본 <input type="date|time">은 OS 언어에 따라 "오전 10:00"처럼 보이고 모양도 앱과 달라서
 * 앱 모양의 버튼 + 펼침 창으로 바꾼다. 시각은 24시간제, 한 주는 일요일 시작.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { addDays, fromInputs, toDateInput, todayInput } from "@/lib/date";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
export const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 분 목록: 5분 단위. 지금 값이 5분 단위가 아니면 그 값도 넣는다 */
export function minutesWith(mm: string): string[] {
  return MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();
}

/** "2026-11-10" → "11월 10일 (화)", 올해가 아니면 앞에 연도 */
export function dateButtonLabel(v: string): string {
  const d = fromInputs(v);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

/* ---------------- 펼침 창 공통 ----------------
 * 창(편집·목표)이 overflow로 자르지 않도록 body에 띄우고(fixed) 버튼 위치에 맞춘다.
 * 아래 자리가 모자라면 위로, 오른쪽이 넘치면 왼쪽으로 민다. 바깥 누르기·Esc·바깥 스크롤로 닫힌다.
 */

function Popover({
  open,
  onClose,
  trigger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      !!t && (wrap.current?.contains(t as Node) || panel.current?.contains(t as Node));
    const onDown = (e: PointerEvent) => !inside(e.target) && onClose();
    const onScroll = (e: Event) => !inside(e.target) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 편집 창의 Esc(닫기)까지 가지 않게 여기서 멈춘다
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  // 처음엔 안 보이게 그려서 크기를 잰 뒤 자리를 정한다 (DOM에 바로 씀)
  useLayoutEffect(() => {
    const el = panel.current;
    const t = wrap.current?.getBoundingClientRect();
    if (!open || !el || !t) return;
    const p = el.getBoundingClientRect();
    const gap = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = t.bottom + gap + p.height <= vh - 8 || t.top - gap - p.height < 8;
    el.style.top = `${below ? t.bottom + gap : t.top - gap - p.height}px`;
    el.style.left = `${Math.max(8, Math.min(t.left, vw - 8 - p.width))}px`;
    el.style.visibility = "visible";
  }, [open]);

  return (
    <span ref={wrap} className="inline-block">
      {trigger}
      {open &&
        createPortal(
          <div
            ref={panel}
            style={{ top: 0, left: 0, visibility: "hidden" }}
            className="fixed z-[70] rounded-lg border border-line bg-bg p-2 shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}

const triggerCls =
  "rounded-md border bg-bg px-2 py-1.5 text-sm tabular-nums outline-none disabled:opacity-50";

/* ---------------- 시각 ---------------- */

/** 24시간 시각 선택: [14:30] 누르면 시·분 목록. 분을 고르면 닫힌다 */
export function TimePicker({
  value,
  onChange,
  ariaLabel,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hh, mm] = value.split(":");
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onClose={close}
      trigger={
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-label={`${ariaLabel} ${value}`}
          aria-expanded={open}
          className={`${triggerCls} ${open ? "border-fg-muted" : "border-line hover:border-line-strong"} ${className}`}
        >
          {value}
        </button>
      }
    >
      <div className="flex gap-1.5">
        <TimeColumn label="시" items={HOURS} value={hh} onPick={(h) => onChange(`${h}:${mm}`)} />
        <TimeColumn
          label="분"
          items={minutesWith(mm)}
          value={mm}
          onPick={(m) => {
            onChange(`${hh}:${m}`);
            close();
          }}
        />
      </div>
    </Popover>
  );
}

/** 시·분 목록 한 줄. 열릴 때 고른 값이 가운데 오도록 스크롤 */
export function TimeColumn({
  label,
  items,
  value,
  onPick,
}: {
  label: string;
  items: string[];
  value: string;
  onPick: (v: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const sel = el?.querySelector<HTMLElement>("[aria-selected=true]");
    if (el && sel) el.scrollTop = sel.offsetTop - el.clientHeight / 2 + sel.clientHeight / 2;
    // 열릴 때 한 번만
  }, []);

  return (
    <div
      ref={box}
      role="listbox"
      aria-label={label}
      className="relative h-44 w-14 overflow-y-auto rounded-md border border-line p-1 [scrollbar-width:none]"
    >
      {items.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={v === value}
          onClick={() => onPick(v)}
          className={`block w-full rounded py-1 text-center text-sm tabular-nums ${
            v === value ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/* ---------------- 날짜 ---------------- */

/** 날짜 선택: [11월 10일 (화)] 누르면 작은 달력. 날을 고르면 닫힌다 */
export function DatePicker({
  value,
  onChange,
  ariaLabel,
  min,
  placeholder = "날짜",
  className = "",
}: {
  /** "YYYY-MM-DD", 빈 문자열이면 placeholder */
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  min?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onClose={close}
      trigger={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`${ariaLabel} ${value ? dateButtonLabel(value) : "없음"}`}
          aria-expanded={open}
          className={`${triggerCls} ${open ? "border-fg-muted" : "border-line hover:border-line-strong"} ${
            value ? "" : "text-fg-faint"
          } ${className}`}
        >
          {value ? dateButtonLabel(value) : placeholder}
        </button>
      }
    >
      <MonthGrid
        value={value}
        min={min}
        onPick={(v) => {
          onChange(v);
          close();
        }}
      />
    </Popover>
  );
}

function MonthGrid({ value, min, onPick }: { value: string; min?: string; onPick: (v: string) => void }) {
  const today = todayInput();
  const base = fromInputs(value || today);
  const [month, setMonth] = useState(new Date(base.getFullYear(), base.getMonth(), 1));

  const first = addDays(month, -month.getDay()); // 그 주 일요일
  const weeks = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
  const move = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const todayOk = !min || today >= min;

  return (
    <div className="w-60">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} aria-label="이전 달" className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg">
          <ChevronLeftIcon width={16} height={16} />
        </button>
        <span className="text-sm font-medium">
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </span>
        <button type="button" onClick={() => move(1)} aria-label="다음 달" className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg">
          <ChevronRightIcon width={16} height={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-fg-faint">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const v = toDateInput(d);
          const other = d.getMonth() !== month.getMonth();
          const off = !!min && v < min;
          const selected = v === value;
          return (
            <button
              key={v}
              type="button"
              disabled={off}
              onClick={() => onPick(v)}
              aria-label={dateButtonLabel(v)}
              aria-pressed={selected}
              className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm tabular-nums disabled:cursor-default disabled:opacity-25 ${
                selected
                  ? "bg-accent text-accent-fg"
                  : `hover:bg-bg-hover ${v === today ? "border border-fg-muted" : ""} ${other ? "text-fg-faint" : ""}`
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      {todayOk && (
        <div className="mt-1 flex justify-end">
          <button type="button" onClick={() => onPick(today)} className="rounded px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg">
            오늘
          </button>
        </div>
      )}
    </div>
  );
}
