"use client";

import dynamic from "next/dynamic";

/** 오늘 날짜·브라우저 저장값에 의존하므로 브라우저에서만 렌더링한다. */
export const TasksClient = dynamic(() => import("./tasks-view").then((m) => m.TasksView), {
  ssr: false,
});
