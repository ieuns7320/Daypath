"use client";

import dynamic from "next/dynamic";

/** 오늘 날짜에 의존하므로 브라우저에서만 렌더링한다. */
export const MoneyClient = dynamic(() => import("./money-view").then((m) => m.MoneyView), {
  ssr: false,
});
