"use client";

import dynamic from "next/dynamic";

/** 오늘 날짜(D-day)에 의존하므로 브라우저에서만 렌더링한다. */
export const RoadmapClient = dynamic(() => import("./roadmap-view").then((m) => m.RoadmapView), {
  ssr: false,
});
