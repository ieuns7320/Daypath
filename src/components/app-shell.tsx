"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStore } from "@/lib/data/store";
import { colorVar } from "@/lib/palette";
import {
  CalendarIcon,
  CheckSquareIcon,
  HashIcon,
  SettingsIcon,
  TargetIcon,
  XIcon,
} from "./icons";

const NAV = [
  { href: "/calendar", label: "캘린더", Icon: CalendarIcon },
  { href: "/todos", label: "할 일", Icon: CheckSquareIcon },
  { href: "/roadmap", label: "로드맵", Icon: TargetIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ErrorBanner />
        <main className="min-h-0 flex-1">{children}</main>
        <BottomTabs />
      </div>
    </div>
  );
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

function Sidebar() {
  const isActive = useIsActive();
  const { categories, tags, mode } = useStore();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-bg-subtle md:flex">
      <div className="px-5 pb-4 pt-5">
        <Link href="/calendar" className="text-[15px] font-semibold tracking-tight">
          Daypath
        </Link>
      </div>

      <nav className="space-y-0.5 px-3">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
              isActive(href) ? "bg-bg-hover font-medium text-fg" : "text-fg-muted hover:bg-bg-hover"
            }`}
          >
            <Icon />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto px-3">
        <section>
          <h2 className="px-2.5 pb-1.5 text-xs font-medium text-fg-faint">카테고리</h2>
          {categories.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="space-y-0.5">
              {[...categories]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 px-2.5 py-1 text-sm">
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ background: colorVar(c.color) }}
                    />
                    <span className="truncate">{c.name}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="px-2.5 pb-1.5 text-xs font-medium text-fg-faint">태그</h2>
          {tags.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="space-y-0.5">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-2.5 py-1 text-sm">
                  <HashIcon width={14} height={14} style={{ color: colorVar(t.color) }} />
                  <span className="truncate">{t.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-line px-3 py-3">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
            isActive("/settings")
              ? "bg-bg-hover font-medium text-fg"
              : "text-fg-muted hover:bg-bg-hover"
          }`}
        >
          <SettingsIcon />
          설정
        </Link>
        {mode === "local" && (
          <p className="px-2.5 pt-2 text-[11px] leading-4 text-fg-faint">
            로컬 모드: 이 브라우저에만 저장돼요
          </p>
        )}
      </div>
    </aside>
  );
}

function EmptyHint() {
  return (
    <Link href="/settings" className="block px-2.5 py-1 text-xs text-fg-faint hover:text-fg-muted">
      설정에서 추가하기
    </Link>
  );
}

function BottomTabs() {
  const isActive = useIsActive();
  const items = [...NAV, { href: "/settings", label: "설정", Icon: SettingsIcon }];
  return (
    <nav className="flex border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
            isActive(href) ? "text-fg" : "text-fg-faint"
          }`}
        >
          <Icon width={20} height={20} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function ErrorBanner() {
  const { error, clearError } = useStore();
  if (!error) return null;
  return (
    <div className="flex items-center gap-3 border-b border-line bg-bg-subtle px-4 py-2 text-sm">
      <span className="text-danger">저장 중 문제가 생겼어요:</span>
      <span className="min-w-0 flex-1 truncate text-fg-muted">{error}</span>
      <button onClick={clearError} aria-label="닫기" className="text-fg-muted hover:text-fg">
        <XIcon />
      </button>
    </div>
  );
}
