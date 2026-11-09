"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
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
import { addDays, addMinutes, dueLabel, fromInputs, nextHour, timeLabel, toDateInput, todayInput } from "@/lib/date";
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

  const [scrollTime] = useState(() => `${String(Math.max(0, new Date().getHours() - 2)).padStart(2, "0")}:00:00`);
  const device = isMobile ? "mobile" : "desktop";
  const viewName = VIEW_OF[mode][device];
  const isMonth = mode === "month";
  // 모바일 월간: 위 달력 + 아래 고른 날 일정 목록. 날짜를 누르면 그날을 고른다.
  const mobileMonth = isMobile && isMonth;
  // 데스크톱 월간: 오른쪽에 고른 날 일정 목록. 날짜 숫자를 누르면 그날을 고른다(빈 칸은 그대로 새 일정).
  const desktopMonth = !isMobile && isMonth;
  /** 데스크톱 월간에서 날짜 숫자를 눌러 시작한 선택인지 (FullCalendar의 select보다 먼저 기록) */
  const numberPress = useRef(false);
  const [selected, setSelected] = useState(todayInput);

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
    // 고른 날이 이번 기간 밖이면: 오늘이 들어 있으면 오늘, 아니면 기간 첫날
    const from = toDateInput(info.view.currentStart);
    const to = toDateInput(info.view.currentEnd);
    setSelected((s) => {
      if (s >= from && s < to) return s;
      const today = todayInput();
      return today >= from && today < to ? today : from;
    });
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
    // 데스크톱 월간에서 날짜 숫자를 눌렀으면 새 일정 대신 그날을 고른다
    if (numberPress.current) {
      numberPress.current = false;
      setSelected(toDateInput(info.start));
      calendarRef.current?.getApi().unselect();
      return;
    }
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

  /** 모바일 월간: 빈 날짜를 누르면 그날을 고른다 (새 일정은 아래 [+ 새 일정]) */
  const handleDateClick = useCallback((info: DateClickInfo) => {
    setSelected(toDateInput(info.date));
  }, []);

  /* ---------- 블록 내용 ---------- */
  const renderItem = useCallback(
    (info: EventDisplayInfo) => {
      const p = info.event.extendedProps as ItemProps;
      // 모바일 월간: 제목 한 줄짜리 작은 상자 (시간·태그·↻ 없음)
      if (isMobile && isMonth)
        return (
          <div
            className="daypath-event daypath-event-box daypath-event-mini"
            style={{ "--event-color": colorVar(p.catColor) } as React.CSSProperties}
          >
            <span className="daypath-event-title">{info.event.title}</span>
          </div>
        );
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

  // 좌우로 밀기: 가로 60px 이상, 세로보다 확실히 많이 움직였을 때만
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    start: (e: React.TouchEvent) => {
      const t = e.touches[0];
      touchStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
    },
    end: (e: React.TouchEvent) => {
      const s = touchStart.current;
      touchStart.current = null;
      if (!s || !interactive) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) api()?.next();
      else api()?.prev();
    },
  };

  const openNew = (day?: string) => {
    const base = day ? fromInputs(day) : (api()?.getDate() ?? new Date());
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

      <div className={`flex min-h-0 flex-1 ${mobileMonth ? "flex-col" : ""}`}>
        {/* 캘린더 (모바일은 좌우로 밀어서 이전·다음) */}
        <div
          className={`daypath-calendar relative min-w-0 ${
            mobileMonth
              ? "daypath-mobile-month h-[64%] min-h-[340px] shrink-0"
              : `min-h-0 flex-1 ${desktopMonth ? "daypath-desktop-month" : ""}`
          }`}
          onTouchStart={isMobile ? swipe.start : undefined}
          onTouchEnd={isMobile ? swipe.end : undefined}
          // 캡처 단계라 FullCalendar가 선택을 시작하기 전에 기록된다
          onPointerDownCapture={(e) => {
            numberPress.current =
              desktopMonth && !!(e.target as Element).closest?.(".daypath-daynum:not(.is-large)");
          }}
        >
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
            // 월간 칸 숫자: "9일" 대신 "9", 오늘은 빨간 동그라미, 다른 달 칸은 흐리게.
            // 일요일 숫자는 빨간색, 토요일은 파란색.
            dayCellClass={(info) => (info.isOther ? "daypath-other-month" : "")}
            dayCellTopClass="daypath-daytop"
            // 월간에서 고른 날은 반전 동그라미 (데스크톱은 숫자를 눌러 고른다)
            dayCellTopContent={(info) => {
              const isSelected = isMonth && !info.inPopover && toDateInput(info.date) === selected;
              return (
                <span
                  className={`daypath-daynum ${
                    info.isToday ? "is-today" : isSelected ? "is-selected" : weekendClass(info.dow)
                  }`}
                  aria-current={info.isToday ? "date" : undefined}
                >
                  {info.date.getDate()}
                </span>
              );
            }}
            // 일·주간 머리: 위에 요일, 아래 큰 숫자 (오늘은 빨간 동그라미). 월간 머리는 요일만.
            dayHeaderContent={(info) =>
              info.view.type.startsWith("dayGrid") ? (
                <span className="daypath-weekday">{info.text}</span>
              ) : (
                <span className="daypath-dayhead">
                  <span className={`daypath-dayhead-dow ${weekendClass(info.dow)}`}>
                    {WEEKDAYS[info.dow]}
                  </span>
                  <span className={`daypath-daynum is-large ${info.isToday ? "is-today" : weekendClass(info.dow)}`}>
                    {info.date.getDate()}
                  </span>
                </span>
              )
            }
            // 24시간 표기: 시간축 "08:00", 일정 시간 "14:30"
            slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            // 처음 열 때 지금 시각 2시간 전부터 보이게
            scrollTime={scrollTime}
            // 30분 칸 높이 (1시간 48px)
            slotMinHeight={24}
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            dayMaxEvents
            eventOrder="start,-duration,allDay,title"
            // 월간의 시간 일정도 점+글자 대신 테두리 블록으로 (색 점이 투명해지므로)
            eventDisplay="block"
            editable={interactive}
            selectable={interactive && !mobileMonth}
            dateClick={mobileMonth ? handleDateClick : undefined}
            // 모바일 월간은 "+N개 더보기" 대신 짧게 "+N"
            moreLinkContent={mobileMonth ? (info) => `+${info.num}` : undefined}
            moreLinkClass={mobileMonth ? "daypath-more" : undefined}
            // 모바일 월간 "+N개": 팝업 대신 그날을 고른다 (같은 월간 보기로 이동 = 제자리)
            moreLinkClick={
              mobileMonth
                ? (info) => {
                    setSelected(toDateInput(info.date));
                    return "dayGridMonth";
                  }
                : undefined
            }
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

          {/* 빠른 추가 (월간은 고른 날 목록의 [+ 새 일정]. 목록이 숨는 태블릿 폭에서는 보임) */}
          {!mobileMonth && (
            <button
              onClick={() => openNew()}
              aria-label="새 일정"
              className={`absolute bottom-5 right-5 z-10 flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg hover:opacity-90 ${
                desktopMonth ? "lg:hidden" : ""
              }`}
            >
              <PlusIcon width={22} height={22} />
            </button>
          )}
        </div>

        {isMonth && (
          <DayAgenda
            className={
              mobileMonth
                ? "min-h-0 flex-1 border-t border-line px-4 pb-6 pt-3"
                : // 1024px 미만(아이패드 세로 등)은 달력이 좁아지므로 숨긴다
                  "hidden w-80 shrink-0 border-l border-line px-4 py-4 lg:block"
            }
            day={selected}
            events={fcEvents}
            onOpen={(p) =>
              p.eventId && setEditor({ kind: "event", id: p.eventId, occurrenceDate: p.occurrenceDate })
            }
            onNew={() => openNew(selected)}
          />
        )}
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

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 모바일 월간 아래: 고른 날의 일정 목록 + [+ 새 일정].
 * 캘린더에 넘기는 일정(반복 회차 펼친 것, 필터 적용)을 그대로 써서 그날과 겹치는 것만 고른다.
 */
function DayAgenda({
  className,
  day,
  events,
  onOpen,
  onNew,
}: {
  /** 놓는 자리(모바일: 달력 아래, 데스크톱: 오른쪽)에 맞춘 크기·테두리 */
  className: string;
  day: string;
  events: EventInput[];
  onOpen: (p: ItemProps) => void;
  onNew: () => void;
}) {
  const dayStart = fromInputs(day);
  const dayEnd = addDays(dayStart, 1);
  const items = events
    .map((ev) => {
      const start = new Date(ev.start as string | Date);
      const end = ev.end ? new Date(ev.end as string | Date) : addMinutes(start, 60);
      return { ev, start, end };
    })
    .filter(({ start, end }) => start < dayEnd && end > dayStart)
    .sort((a, b) => Number(!a.ev.allDay) - Number(!b.ev.allDay) || a.start.getTime() - b.start.getTime());
  const label = dueLabel(day);
  // "오늘" / "내일" / "어제"면 날짜도 함께
  const heading = /\d/.test(label)
    ? label
    : `${dayStart.getMonth() + 1}월 ${dayStart.getDate()}일 (${WEEKDAYS[dayStart.getDay()]}) · ${label}`;

  return (
    <section className={`overflow-y-auto ${className}`} aria-label="고른 날 일정">
      <h2 className="mb-2 text-sm font-semibold">{heading}</h2>
      {items.length === 0 && <p className="py-2 text-sm text-fg-faint">일정이 없어요.</p>}
      <ul className="space-y-1.5">
        {items.map(({ ev, start, end }) => {
          const p = ev.extendedProps as ItemProps;
          // 여러 날에 걸친 시간 일정은 그날 밖으로 이어지는 쪽을 "··"로
          const time = ev.allDay
            ? "종일"
            : `${start >= dayStart ? timeLabel(start.toISOString()) : "··"} ~ ${
                end <= dayEnd ? timeLabel(end.toISOString()) : "··"
              }`;
          return (
            <li key={String(ev.id)}>
              <button
                onClick={() => onOpen(p)}
                className="flex w-full items-stretch gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:bg-bg-hover"
              >
                <span className="w-[84px] shrink-0 text-xs tabular-nums leading-5 text-fg-muted">{time}</span>
                <span
                  className="w-[3px] shrink-0 rounded-full"
                  style={{ background: colorVar(p.catColor) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium leading-5">{ev.title}</span>
                    {p.recurring && (
                      <RepeatIcon width={12} height={12} className="shrink-0 text-fg-faint" aria-label="반복" />
                    )}
                  </span>
                  {!!p.tags?.length && (
                    <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-fg-muted">
                      {p.tags.map((t, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="size-[7px] rounded-full" style={{ background: colorVar(t.color) }} />
                          {t.name}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        onClick={onNew}
        className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
      >
        <PlusIcon width={16} height={16} /> 새 일정
      </button>
    </section>
  );
}

/** 주말 날짜 숫자 색: 일요일 빨강, 토요일 파랑 */
function weekendClass(dow: number): string {
  return dow === 0 ? "daypath-sunday" : dow === 6 ? "daypath-saturday" : "";
}
