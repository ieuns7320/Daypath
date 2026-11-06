"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar, {
  type CalendarRef,
  type DateSelectInfo,
  type DatesSetInfo,
  type DropInfo,
  type EventChangeInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventInput,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import classicTheme from "@fullcalendar/react/themes/classic";
import koLocale from "@fullcalendar/react/locales/ko";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import "./calendar-theme.css";

import { useStore } from "@/lib/data/store";
import { addDays, addMinutes, fromInputs, nextHour, toDateInput } from "@/lib/date";
import { colorVar, type ColorKey } from "@/lib/palette";
import type { Task } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { ItemEditor, type EditorTarget } from "../editor/item-editor";
import { FilterButton } from "../filter/filter-button";
import { CheckSquareIcon, ChevronLeftIcon, ChevronRightIcon, PanelIcon, PlusIcon } from "../icons";
import { TaskCheckbox } from "../tasks/task-checkbox";
import { TaskPanel } from "./task-panel";

type Mode = "day" | "week" | "month";

const VIEW_OF: Record<Mode, { desktop: string; mobile: string }> = {
  day: { desktop: "timeGridDay", mobile: "timeGridDay" },
  // 모바일은 7일이 너무 좁아서 3일 보기
  week: { desktop: "timeGridWeek", mobile: "timeGridThreeDay" },
  month: { desktop: "dayGridMonth", mobile: "dayGridMonth" },
};

const MODE_LABEL: Record<Mode, { desktop: string; mobile: string }> = {
  day: { desktop: "일", mobile: "일" },
  week: { desktop: "주", mobile: "3일" },
  month: { desktop: "월", mobile: "월" },
};

/** 캘린더 항목 종류. FullCalendar 이벤트 id 앞에 붙여 구분한다. */
type ItemKind = "event" | "task" | "tasksum";
type ItemProps = {
  kind: ItemKind;
  tags?: { name: string; color: ColorKey }[];
  taskId?: string;
  done?: boolean;
  scheduled?: boolean;
  catColor?: ColorKey | null;
  date?: string;
  open?: number;
  total?: number;
};

const SHOW_TASKS_KEY = "daypath:cal-show-tasks";
const PANEL_KEY = "daypath:cal-task-panel";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 저장 실패해도 이번 화면에서는 적용됨
  }
}

/** 할 일이 캘린더에 놓이는 날짜: 작업 시간이 있으면 그 날, 없으면 마감일 */
function taskDay(t: Task): string | null {
  if (t.scheduled_start) return toDateInput(new Date(t.scheduled_start));
  return t.due_date;
}

export function CalendarView() {
  const store = useStore();
  const { events, tasks, categories, tags, saveEvent, saveTask, toggleTask, matchesFilter } = store;
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mode, setMode] = useState<Mode>("week");
  const [title, setTitle] = useState("");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [showTasks, setShowTasks] = useState(() => readFlag(SHOW_TASKS_KEY, true));
  const [panelOpen, setPanelOpen] = useState(() => readFlag(PANEL_KEY, false));
  const calendarRef = useRef<CalendarRef>(null);
  // FullCalendar는 화면에 붙기(커밋) 전에 내부 상태를 바꾸는 경우가 있어서,
  // 페이지 전환처럼 렌더링이 중간에 멈출 수 있는 시점에는 그리지 않는다.
  // 이 컴포넌트가 화면에 붙은 다음 일반 업데이트로 캘린더를 그린다.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도한 두 번째 렌더 (위 설명)
  useEffect(() => setMounted(true), []);
  const api = () => calendarRef.current?.getApi();
  // 편집 창이 떠 있는 동안에는 캘린더 클릭/드래그가 새 선택으로 새어 나가지 않게 막는다.
  const interactive = editor === null;

  const device = isMobile ? "mobile" : "desktop";
  const viewName = VIEW_OF[mode][device];
  const isMonth = mode === "month";
  const showPanel = panelOpen && !isMobile;

  // 보기 전환: 캘린더를 다시 만들지 않고 보기만 바꿔서 보던 날짜를 유지한다.
  useEffect(() => {
    const calendar = calendarRef.current?.getApi();
    if (calendar && calendar.view.type !== viewName) calendar.changeView(viewName);
  }, [viewName]);

  // 날짜 범위가 바뀐 뒤(마운트 이후) 호출되므로 여기서 제목을 갱신해도 안전하다.
  const handleDatesSet = useCallback((info: DatesSetInfo) => setTitle(info.view.title), []);

  /* ---------- 저장된 데이터 → FullCalendar 형식 ---------- */
  const fcEvents = useMemo<EventInput[]>(() => {
    const catColor = new Map(categories.map((c) => [c.id, c.color]));
    const tagById = new Map(tags.map((t) => [t.id, t]));
    const tagsOf = (ids: string[]) =>
      ids.flatMap((id) => {
        const t = tagById.get(id);
        return t ? [{ name: t.name, color: t.color }] : [];
      });

    const list: EventInput[] = events.filter(matchesFilter).map((e) => ({
      id: `event:${e.id}`,
      title: e.title,
      start: e.start_at,
      end: e.end_at,
      allDay: e.all_day,
      color: colorVar(e.category_id ? catColor.get(e.category_id) : null),
      order: 0,
      extendedProps: { kind: "event", tags: tagsOf(e.tag_ids) } satisfies ItemProps,
    }));

    if (!showTasks) return list;
    const visibleTasks = tasks.filter((t) => matchesFilter(t) && taskDay(t) !== null);

    if (isMonth) {
      // 월간: 날짜별 개수만 요약
      const byDay = new Map<string, { open: number; total: number }>();
      for (const t of visibleTasks) {
        const day = taskDay(t)!;
        const s = byDay.get(day) ?? { open: 0, total: 0 };
        s.total += 1;
        if (!t.done) s.open += 1;
        byDay.set(day, s);
      }
      for (const [date, s] of byDay) {
        list.push({
          id: `tasksum:${date}`,
          title: `할 일 ${s.open}`,
          start: date,
          allDay: true,
          editable: false,
          color: "transparent",
          contrastColor: "var(--fg)",
          order: 1,
          extendedProps: { kind: "tasksum", date, open: s.open, total: s.total } satisfies ItemProps,
        });
      }
      return list;
    }

    for (const t of visibleTasks) {
      const cat = t.category_id ? (catColor.get(t.category_id) ?? null) : null;
      const scheduled = !!(t.scheduled_start && t.scheduled_end);
      list.push({
        id: `task:${t.id}`,
        title: t.title,
        start: scheduled ? t.scheduled_start! : t.due_date!,
        end: scheduled ? t.scheduled_end! : undefined,
        allDay: !scheduled,
        color: "transparent",
        contrastColor: "var(--fg)",
        order: 1,
        extendedProps: {
          kind: "task",
          taskId: t.id,
          done: t.done,
          scheduled,
          catColor: cat,
          tags: tagsOf(t.tag_ids),
        } satisfies ItemProps,
      });
    }
    return list;
  }, [events, tasks, categories, tags, matchesFilter, showTasks, isMonth]);

  /* ---------- 드래그로 옮기거나 길이를 바꾼 뒤 저장 ---------- */
  const handleChange = useCallback(
    (info: EventChangeInfo) => {
      const props = info.event.extendedProps as ItemProps;
      const start = info.event.start;
      if (!start) return info.revert();
      const allDay = info.event.allDay;
      // 종일 ↔ 시간 영역을 오가면 end가 비어 있을 수 있음
      const end = info.event.end ?? (allDay ? addDays(start, 1) : addMinutes(start, 60));

      if (props.kind === "event") {
        const original = events.find((e) => `event:${e.id}` === info.event.id);
        if (!original) return info.revert();
        void saveEvent({
          ...original,
          all_day: allDay,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
        });
      } else if (props.kind === "task") {
        const original = tasks.find((t) => t.id === props.taskId);
        if (!original) return info.revert();
        void saveTask(
          allDay
            ? // 종일 칸에 놓으면: 그 날이 마감일, 작업 시간은 해제
              { ...original, due_date: toDateInput(start), scheduled_start: null, scheduled_end: null }
            : // 시간 칸에 놓으면: 작업 시간 배정 (타임 블로킹)
              { ...original, scheduled_start: start.toISOString(), scheduled_end: end.toISOString() },
        );
      } else {
        info.revert();
      }
    },
    [events, tasks, saveEvent, saveTask],
  );

  /* ---------- 할 일 패널에서 끌어다 놓기 ---------- */
  const handleDrop = useCallback(
    (info: DropInfo) => {
      const id = info.draggedEl.dataset.taskId;
      const original = tasks.find((t) => t.id === id);
      if (!original) return;
      if (info.allDay) {
        void saveTask({
          ...original,
          due_date: toDateInput(info.date),
          scheduled_start: null,
          scheduled_end: null,
        });
      } else {
        void saveTask({
          ...original,
          scheduled_start: info.date.toISOString(),
          scheduled_end: addMinutes(info.date, 60).toISOString(),
        });
      }
    },
    [tasks, saveTask],
  );

  const handleSelect = useCallback((info: DateSelectInfo) => {
    let end = info.end;
    // 한 번 클릭(아주 짧은 선택)이면 1시간짜리로 시작
    if (!info.allDay && end.getTime() - info.start.getTime() < 30 * 60_000) {
      end = addMinutes(info.start, 60);
    }
    setEditor({ kind: "new", type: "event", start: info.start, end, allDay: info.allDay });
    calendarRef.current?.getApi().unselect();
  }, []);

  const handleClick = useCallback((info: EventClickInfo) => {
    info.jsEvent.preventDefault();
    // 체크박스를 누른 경우는 완료 전환만 (체크박스가 직접 처리)
    if ((info.jsEvent.target as HTMLElement | null)?.closest("[data-task-check]")) return;
    const props = info.event.extendedProps as ItemProps;
    if (props.kind === "tasksum" && props.date) {
      // 월간 요약을 누르면 그날의 일간 보기로
      setMode("day");
      calendarRef.current?.getApi().gotoDate(fromInputs(props.date));
      return;
    }
    if (props.kind === "task" && props.taskId) setEditor({ kind: "task", id: props.taskId });
    else setEditor({ kind: "event", id: info.event.id.replace(/^event:/, "") });
  }, []);

  /* ---------- 블록 내용 ---------- */
  const renderItem = useCallback(
    (info: EventDisplayInfo) => {
      const p = info.event.extendedProps as ItemProps;
      if (p.kind === "tasksum") {
        const allDone = p.open === 0;
        return (
          <div className="daypath-event daypath-tasksum">
            <TaskCheckbox done={allDone} size={13} />
            <span className="daypath-event-title">
              {allDone ? `할 일 ${p.total} 완료` : `할 일 ${p.open}`}
            </span>
          </div>
        );
      }
      // 태그는 제목 아래 줄에 "#이름" 칩으로 (태그 색 배경)
      const tagLine = p.tags?.length ? (
        <span className="daypath-event-tags">
          {p.tags.map((t, i) => (
            <span key={i} className="daypath-event-tag" style={{ background: colorVar(t.color) }}>
              #{t.name}
            </span>
          ))}
        </span>
      ) : null;

      if (p.kind === "task") {
        const color = colorVar(p.catColor);
        const check = (
          <TaskCheckbox
            done={!!p.done}
            size={13}
            color={color}
            onToggle={() => p.taskId && void toggleTask(p.taskId)}
          />
        );
        return (
          <div
            className={`daypath-event daypath-task ${p.scheduled ? "is-scheduled" : ""} ${
              p.done ? "is-done" : ""
            }`}
            style={{ "--task-color": color } as React.CSSProperties}
          >
            {/* 작업 시간 블록: 윗줄 시간, 아랫줄 체크 + 제목 */}
            {info.timeText && <span className="daypath-event-time w-full">{info.timeText}</span>}
            <span className="daypath-task-line">
              {check}
              <span className="daypath-event-title">{info.event.title}</span>
            </span>
            {tagLine}
          </div>
        );
      }

      return (
        <div className="daypath-event">
          {info.timeText && <span className="daypath-event-time">{info.timeText}</span>}
          <span className="daypath-event-title">{info.event.title}</span>
          {tagLine}
        </div>
      );
    },
    [toggleTask],
  );

  const openNew = () => {
    const base = api()?.getDate() ?? new Date();
    // 보고 있는 날짜에 다음 정각으로 1시간짜리 초안
    const start = nextHour();
    start.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    setEditor({ kind: "new", type: "event", start, end: addMinutes(start, 60), allDay: false });
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* 헤더 */}
      <header className="flex items-center gap-1 border-b border-line px-3 py-2.5 md:gap-2 md:px-5">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:text-lg">
          {title}
        </h1>
        <div className="flex items-center">
          <IconButton label="이전" onClick={() => api()?.prev()}>
            <ChevronLeftIcon />
          </IconButton>
          <button
            onClick={() => api()?.today()}
            className="rounded-md px-1.5 py-1 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg md:px-2"
          >
            오늘
          </button>
          <IconButton label="다음" onClick={() => api()?.next()}>
            <ChevronRightIcon />
          </IconButton>
        </div>
        <div className="flex rounded-lg bg-bg-hover p-0.5" role="tablist" aria-label="보기 전환">
          {(Object.keys(VIEW_OF) as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2 py-1 text-xs md:px-3 md:text-sm ${
                mode === m ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted"
              }`}
            >
              {MODE_LABEL[m][device]}
            </button>
          ))}
        </div>
        <ToggleButton
          label={showTasks ? "할 일 숨기기" : "할 일 표시"}
          pressed={showTasks}
          onClick={() => {
            setShowTasks(!showTasks);
            writeFlag(SHOW_TASKS_KEY, !showTasks);
          }}
        >
          <CheckSquareIcon />
        </ToggleButton>
        <span className="hidden md:inline-flex">
          <ToggleButton
            label={panelOpen ? "할 일 패널 닫기" : "할 일 패널 열기"}
            pressed={panelOpen}
            onClick={() => {
              setPanelOpen(!panelOpen);
              writeFlag(PANEL_KEY, !panelOpen);
            }}
          >
            <PanelIcon />
          </ToggleButton>
        </span>
        <FilterButton />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 캘린더 */}
        <div className="daypath-calendar relative min-h-0 min-w-0 flex-1">
          {mounted && <FullCalendar
            ref={calendarRef}
            plugins={[classicTheme, dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={koLocale}
            initialView={viewName}
            datesSet={handleDatesSet}
            views={{
              timeGridThreeDay: { type: "timeGrid", duration: { days: 3 } },
            }}
            headerToolbar={false}
            height="100%"
            firstDay={0}
            nowIndicator
            allDayText="종일"
            // 24시간 표기: 시간축 "08:00", 일정 시간 "14:30"
            slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            scrollTime="08:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            dayMaxEvents
            // 일정 먼저, 그다음 할 일
            eventOrder="order,start,-duration,allDay,title"
            editable={interactive}
            selectable={interactive}
            droppable={interactive}
            selectMirror
            eventLongPressDelay={250}
            selectLongPressDelay={250}
            events={fcEvents}
            select={handleSelect}
            eventClick={handleClick}
            eventDrop={handleChange}
            eventResize={handleChange}
            drop={handleDrop}
            eventContent={renderItem}
          />}

          {/* 빠른 추가 */}
          <button
            onClick={openNew}
            aria-label="새 일정"
            className="absolute bottom-5 right-5 z-10 flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg hover:opacity-90"
          >
            <PlusIcon width={22} height={22} />
          </button>
        </div>

        {/* 데스크톱: 할 일 패널 (캘린더로 끌어다 놓아 시간 배정) */}
        {showPanel && <TaskPanel onOpen={(id) => setEditor({ kind: "task", id })} />}
      </div>

      {editor && <ItemEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

function ToggleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`rounded-md p-1.5 hover:bg-bg-hover ${pressed ? "bg-bg-hover text-fg" : "text-fg-faint"}`}
    >
      {children}
    </button>
  );
}
