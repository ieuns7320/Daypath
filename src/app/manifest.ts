import type { MetadataRoute } from "next";

/** PWA manifest: 홈 화면·작업 표시줄에 설치할 때 쓰는 정보 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daypath",
    short_name: "Daypath",
    description: "일정, 할 일, 로드맵을 하나로 관리하는 개인용 앱",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111113",
    theme_color: "#111113",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
