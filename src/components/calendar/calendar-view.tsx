"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar, {
  type CalendarRef,
  type DateSelectInfo,
  type DatesSetInfo,
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
import { addDays, addMinutes, nextHour } from "@/lib/date";
import { colorVar } from "@/lib/palette";
import { useMediaQuery } from "@/lib/use-media-query";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "../icons";
import { EventEditor, type EditorTarget } from "./event-editor";

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

export function CalendarView() {
  const { events, categories, tags, saveEvent } = useStore();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mode, setMode] = useState<Mode>("week");
  const [title, setTitle] = useState("");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const calendarRef = useRef<CalendarRef>(null);
  const api = () => calendarRef.current?.getApi();
  // 편집 창이 떠 있는 동안에는 캘린더 클릭/드래그가 새 선택으로 새어 나가지 않게 막는다.
  const interactive = editor === null;

  const device = isMobile ? "mobile" : "desktop";
  const viewName = VIEW_OF[mode][device];

  // 보기 전환: 캘린더를 다시 만들지 않고 보기만 바꿔서 보던 날짜를 유지한다.
  useEffect(() => {
    const calendar = calendarRef.current?.getApi();
    if (calendar && calendar.view.type !== viewName) calendar.changeView(viewName);
  }, [viewName]);

  // 날짜 범위가 바뀐 뒤(마운트 이후) 호출되므로 여기서 제목을 갱신해도 안전하다.
  const handleDatesSet = useCallback((info: DatesSetInfo) => setTitle(info.view.title), []);

  /* 저장된 일정 → FullCalendar 형식 */
  const fcEvents = useMemo<EventInput[]>(() => {
    const catColor = new Map(categories.map((c) => [c.id, c.color]));
    const tagColor = new Map(tags.map((t) => [t.id, t.color]));
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start_at,
      end: e.end_at,
      allDay: e.all_day,
      color: colorVar(e.category_id ? catColor.get(e.category_id) : null),
      extendedProps: {
        tagColors: e.tag_ids.map((id) => tagColor.get(id)).filter(Boolean),
      },
    }));
  }, [events, categories, tags]);

  /* 드래그로 옮기거나 길이를 바꾼 뒤 저장 */
  const handleChange = useCallback(
    (info: EventChangeInfo) => {
      const original = events.find((e) => e.id === info.event.id);
      const start = info.event.start;
      if (!original || !start) return info.revert();
      const allDay = info.event.allDay;
      // 종일 ↔ 시간 영역을 오가면 end가 비어 있을 수 있음
      const end = info.event.end ?? (allDay ? addDays(start, 1) : addMinutes(start, 60));
      void saveEvent({
        ...original,
        all_day: allDay,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      });
    },
    [events, saveEvent],
  );

  const handleSelect = useCallback((info: DateSelectInfo) => {
    let end = info.end;
    // 한 번 클릭(아주 짧은 선택)이면 1시간짜리로 시작
    if (!info.allDay && end.getTime() - info.start.getTime() < 30 * 60_000) {
      end = addMinutes(info.start, 60);
    }
    setEditor({ kind: "new", start: info.start, end, allDay: info.allDay });
    calendarRef.current?.getApi().unselect();
  }, []);

  const handleClick = useCallback((info: EventClickInfo) => {
    info.jsEvent.preventDefault();
    setEditor({ kind: "edit", id: info.event.id });
  }, []);

  const openNew = () => {
    const base = api()?.getDate() ?? new Date();
    const now = new Date();
    // 보고 있는 날짜에 다음 정각으로 1시간짜리 초안
    const start = nextHour(now);
    start.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    setEditor({ kind: "new", start, end: addMinutes(start, 60), allDay: false });
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* 헤더 */}
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 md:px-5">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:text-lg">
          {title}
        </h1>
        <div className="flex items-center">
          <IconButton label="이전" onClick={() => api()?.prev()}>
            <ChevronLeftIcon />
          </IconButton>
          <button
            onClick={() => api()?.today()}
            className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
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
              className={`rounded-md px-2.5 py-1 text-xs md:px-3 md:text-sm ${
                mode === m ? "bg-bg font-medium text-fg shadow-sm" : "text-fg-muted"
              }`}
            >
              {MODE_LABEL[m][device]}
            </button>
          ))}
        </div>
      </header>

      {/* 캘린더 */}
      <div className="daypath-calendar min-h-0 flex-1">
        <FullCalendar
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
          editable={interactive}
          selectable={interactive}
          selectMirror
          eventLongPressDelay={250}
          selectLongPressDelay={250}
          events={fcEvents}
          select={handleSelect}
          eventClick={handleClick}
          eventDrop={handleChange}
          eventResize={handleChange}
          eventContent={renderEvent}
        />
      </div>

      {/* 빠른 추가 */}
      <button
        onClick={openNew}
        aria-label="새 일정"
        className="absolute bottom-5 right-5 z-10 flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg hover:opacity-90"
      >
        <PlusIcon width={22} height={22} />
      </button>

      {editor && <EventEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

/** 일정 블록 내용: 시간 · 제목 · 태그 점 */
function renderEvent(info: EventDisplayInfo) {
  const tagColors = (info.event.extendedProps.tagColors ?? []) as string[];
  return (
    <div className="daypath-event">
      {info.timeText && <span className="daypath-event-time">{info.timeText}</span>}
      <span className="daypath-event-title">{info.event.title}</span>
      {tagColors.length > 0 && (
        <span className="daypath-event-tags">
          {tagColors.map((c, i) => (
            <span key={i} style={{ background: colorVar(c as never) }} />
          ))}
        </span>
      )}
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
