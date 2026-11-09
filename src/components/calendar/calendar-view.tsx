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

import { useScoped, useStore } from "@/lib/data/store";
import { addDays, addMinutes, nextHour, toDateInput } from "@/lib/date";
import { colorVar, type ColorKey } from "@/lib/palette";
import { expandEvent } from "@/lib/recurrence";
import { updateOccurrence, type Scope } from "@/lib/series";
import { useMediaQuery } from "@/lib/use-media-query";
import { ItemEditor, type EditorTarget } from "../editor/item-editor";
import { ScopeDialog } from "../editor/scope-dialog";
import { FilterButton } from "../filter/filter-button";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RepeatIcon } from "../icons";

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

/** 캘린더 항목 정보 (캘린더에는 일정만 나온다. 할 일은 할 일 탭에서 따로 관리) */
type ItemProps = {
  /** 일정 id (반복 회차여도 원래 반복 일정의 id) */
  eventId?: string;
  /** 반복 회차의 날짜 "YYYY-MM-DD" */
  occurrenceDate?: string;
  /** 반복 일정(회차 또는 떼어 낸 회차)이면 ↻ 표시 */
  recurring?: boolean;
  /** 월간: 이 일정이 걸친 날 중 가장 많은 일정 수 (막대 두께 결정) */
  density?: number;
  tags?: { name: string; color: ColorKey }[];
  catColor?: ColorKey | null;
};

export function CalendarView() {
  const store = useStore();
  const { events, saveEvent } = store;
  // 캘린더용 카테고리·태그만
  const { categories, tags, matchesFilter } = useScoped("event");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mode, setMode] = useState<Mode>("month");
  const [title, setTitle] = useState("");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  // 반복 회차를 드래그한 뒤 범위(이 일정만/이후/전체)를 묻는 중
  const [pendingMove, setPendingMove] = useState<{
    seriesId: string;
    occDate: string;
    start: Date;
    end: Date;
    allDay: boolean;
    revert: () => void;
  } | null>(null);
  const calendarRef = useRef<CalendarRef>(null);
  // FullCalendar는 화면에 붙기(커밋) 전에 내부 상태를 바꾸는 경우가 있어서,
  // 페이지 전환처럼 렌더링이 중간에 멈출 수 있는 시점에는 그리지 않는다.
  // 이 컴포넌트가 화면에 붙은 다음 일반 업데이트로 캘린더를 그린다.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도한 두 번째 렌더 (위 설명)
  useEffect(() => setMounted(true), []);
  const api = () => calendarRef.current?.getApi();
  // 편집 창이 떠 있는 동안에는 캘린더 클릭/드래그가 새 선택으로 새어 나가지 않게 막는다.
  const interactive = editor === null && pendingMove === null;

  const device = isMobile ? "mobile" : "desktop";
  const viewName = VIEW_OF[mode][device];
  const isMonth = mode === "month";

  // 보기 전환: 캘린더를 다시 만들지 않고 보기만 바꿔서 보던 날짜를 유지한다.
  useEffect(() => {
    const calendar = calendarRef.current?.getApi();
    if (calendar && calendar.view.type !== viewName) calendar.changeView(viewName);
  }, [viewName]);

  // 날짜 범위가 바뀐 뒤(마운트 이후) 호출되므로 여기서 제목을 갱신해도 안전하다.
  // 보이는 기간: 반복 일정은 이 기간만 회차를 펼친다
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const handleDatesSet = useCallback((info: DatesSetInfo) => {
    setTitle(info.view.title);
    setRange((r) =>
      r && r.start.getTime() === info.start.getTime() && r.end.getTime() === info.end.getTime()
        ? r
        : { start: info.start, end: info.end },
    );
  }, []);

  /* ---------- 저장된 데이터 → FullCalendar 형식 ---------- */
  const fcEvents = useMemo<EventInput[]>(() => {
    const catColor = new Map(categories.map((c) => [c.id, c.color]));
    const tagById = new Map(tags.map((t) => [t.id, t]));
    const tagsOf = (ids: string[]) =>
      ids.flatMap((id) => {
        const t = tagById.get(id);
        return t ? [{ name: t.name, color: t.color }] : [];
      });

    const list: EventInput[] = [];
    for (const e of events.filter(matchesFilter)) {
      const base = {
        title: e.title,
        allDay: e.all_day,
        // 칠하지 않고 블록 안에서 카테고리 색 테두리로 그린다 (renderItem)
        color: "transparent",
        contrastColor: "var(--fg)",
        order: 0,
      };
      const props: ItemProps = {
        eventId: e.id,
        recurring: !!(e.rrule || e.series_id),
        tags: tagsOf(e.tag_ids),
        catColor: e.category_id ? (catColor.get(e.category_id) ?? null) : null,
      };
      if (e.rrule) {
        // 반복 일정: 보이는 기간의 회차만 펼친다
        if (!range) continue;
        for (const occ of expandEvent(e, range.start, range.end)) {
          list.push({
            ...base,
            id: `event:${e.id}@${occ.date}`,
            start: occ.start,
            end: occ.end,
            extendedProps: { ...props, occurrenceDate: occ.date } satisfies ItemProps,
          });
        }
      } else {
        list.push({
          ...base,
          id: `event:${e.id}`,
          start: e.start_at,
          end: e.end_at,
          extendedProps: props,
        });
      }
    }

    // 월간: 날짜별 일정 수에 따라 막대 높이를 정한다 (적을수록 두껍게).
    // 여러 날 일정은 걸친 날 중 가장 붐비는 날 기준.
    if (isMonth) {
      const daysOf = (ev: EventInput) => {
        const start = new Date(ev.start as string | Date);
        const end = ev.end ? new Date(ev.end as string | Date) : start;
        const out: string[] = [];
        let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        do {
          out.push(toDateInput(d));
          d = addDays(d, 1);
        } while (d < end && out.length < 62);
        return out;
      };
      const perDay = new Map<string, number>();
      const spans = list.map(daysOf);
      for (const days of spans) for (const k of days) perDay.set(k, (perDay.get(k) ?? 0) + 1);
      list.forEach((ev, i) => {
        const density = Math.max(...spans[i].map((k) => perDay.get(k) ?? 1));
        (ev.extendedProps as ItemProps).density = density;
      });
    }

    return list;
  }, [events, categories, tags, matchesFilter, isMonth, range]);

  /* ---------- 드래그로 옮기거나 길이를 바꾼 뒤 저장 ---------- */
  const handleChange = useCallback(
    (info: EventChangeInfo) => {
      const props = info.event.extendedProps as ItemProps;
      const start = info.event.start;
      if (!start) return info.revert();
      const allDay = info.event.allDay;
      // 종일 ↔ 시간 영역을 오가면 end가 비어 있을 수 있음
      const end = info.event.end ?? (allDay ? addDays(start, 1) : addMinutes(start, 60));

      const original = events.find((e) => e.id === props.eventId);
      if (!original) return info.revert();
      if (original.rrule && props.occurrenceDate) {
        // 반복 회차: 범위를 물은 뒤 저장 (취소하면 제자리로)
        setPendingMove({
          seriesId: original.id,
          occDate: props.occurrenceDate,
          start,
          end,
          allDay,
          revert: info.revert,
        });
        return;
      }
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
    const props = info.event.extendedProps as ItemProps;
    if (props.eventId)
      setEditor({ kind: "event", id: props.eventId, occurrenceDate: props.occurrenceDate });
  }, []);

  /** 반복 회차 드래그 후 범위를 고르면 저장 */
  const applyMove = (scope: Scope) => {
    if (!pendingMove) return;
    const series = events.find((e) => e.id === pendingMove.seriesId);
    setPendingMove(null);
    if (!series) return;
    const { occDate, start, end, allDay } = pendingMove;
    void store.applyEventChanges(
      updateOccurrence(
        events,
        series,
        occDate,
        scope,
        { ...series, all_day: allDay, start_at: start.toISOString(), end_at: end.toISOString() },
        () => crypto.randomUUID(),
      ),
    );
  };

  /* ---------- 블록 내용 ---------- */
  const renderItem = useCallback(
    (info: EventDisplayInfo) => {
      const p = info.event.extendedProps as ItemProps;
      // 태그는 제목 아래 줄에 "● 이름" (점만 태그 색)
      const tagLine = p.tags?.length ? (
        <span className="daypath-event-tags">
          {p.tags.map((t, i) => (
            <span
              key={i}
              className="daypath-event-tag"
              style={{ "--tag-color": colorVar(t.color) } as React.CSSProperties}
            >
              <span className="truncate">{t.name}</span>
            </span>
          ))}
        </span>
      ) : null;

      return (
        <div
          className={`daypath-event daypath-event-box ${
            p.density ? `is-density-${Math.min(p.density, 4)}` : ""
          }`}
          style={{ "--event-color": colorVar(p.catColor) } as React.CSSProperties}
        >
          {info.timeText && <span className="daypath-event-time">{info.timeText}</span>}
          <span className="daypath-event-title">{info.event.title}</span>
          {/* 모바일 월간은 칸이 좁아 ↻가 줄을 차지하므로 숨긴다 */}
          {p.recurring && !(isMobile && isMonth) && (
            <RepeatIcon width={11} height={11} className="daypath-event-repeat" aria-label="반복" />
          )}
          {tagLine}
        </div>
      );
    },
    [isMobile, isMonth],
  );

  const openNew = () => {
    const base = api()?.getDate() ?? new Date();
    // 보고 있는 날짜에 다음 정각으로 1시간짜리 초안
    const start = nextHour();
    start.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    setEditor({ kind: "new", start, end: addMinutes(start, 60), allDay: false });
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
        <FilterButton kind="event" />
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
            // 시간축 칸 너비는 안에 든 글자 폭으로 정해지므로, 글자에 좌우 여백을 줘서 넓힌다
            slotHeaderInnerClass="daypath-axis-label"
            allDayHeaderInnerClass="daypath-axis-label"
            // 24시간 표기: 시간축 "08:00", 일정 시간 "14:30"
            slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            scrollTime="08:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            dayMaxEvents
            eventOrder="start,-duration,allDay,title"
            // 월간의 시간 일정도 점+글자 대신 테두리 블록으로 (색 점이 투명해지므로)
            eventDisplay="block"
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
      </div>

      {editor && <ItemEditor target={editor} onClose={() => setEditor(null)} />}
      {pendingMove && (
        <ScopeDialog
          action="save"
          onChoose={applyMove}
          onCancel={() => {
            pendingMove.revert();
            setPendingMove(null);
          }}
        />
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
