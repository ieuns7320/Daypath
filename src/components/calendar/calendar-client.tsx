"use client";

import dynamic from "next/dynamic";

/**
 * 캘린더는 현재 시각과 브라우저에 저장된 데이터에 의존하므로
 * 서버에서 미리 그리지 않고 브라우저에서만 렌더링한다.
 */
export const CalendarClient = dynamic(
  () => import("./calendar-view").then((m) => m.CalendarView),
  { ssr: false },
);
