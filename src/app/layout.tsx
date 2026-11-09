import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daypath",
  description: "일정, 할 일, 로드맵을 하나로 관리하는 개인용 앱",
  // iPhone·iPad 홈 화면에 추가했을 때 주소창 없이 앱처럼 열기
  appleWebApp: { capable: true, title: "Daypath", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning className="h-full antialiased">
      <body className="h-full">
        {/* class="dark"는 Tailwind용, data-color-scheme은 FullCalendar 테마용 */}
        <ThemeProvider
          attribute={["class", "data-color-scheme"]}
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
