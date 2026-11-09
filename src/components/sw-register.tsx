"use client";

import { useEffect } from "react";
import { listenInstallPrompt } from "@/lib/pwa";

/**
 * 서비스 워커 등록(PWA 설치·3c 알림용)과 설치 이벤트 붙잡기.
 * 화면에는 아무것도 그리지 않는다.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    const stop = listenInstallPrompt();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => console.warn("서비스 워커 등록 실패", err));
    }
    return stop;
  }, []);
  return null;
}
