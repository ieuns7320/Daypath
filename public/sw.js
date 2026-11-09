// Daypath 서비스 워커 (최소 버전)
// 오프라인 지원은 범위 밖이라 캐시하지 않는다. 3c 알림에서 push / notificationclick 처리를 여기에 더한다.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
