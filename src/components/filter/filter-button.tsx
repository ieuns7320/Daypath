"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/data/store";
import { colorVar } from "@/lib/palette";
import { FilterIcon, HashIcon, XIcon } from "../icons";

/**
 * 모바일용 필터 버튼 (데스크톱은 사이드바에서 필터).
 * 누르면 아래에서 카테고리·태그 선택 시트가 올라온다.
 */
export function FilterButton() {
  const { filterActive, filter } = useStore();
  const [open, setOpen] = useState(false);
  const count = filter.categoryIds.length + filter.tagIds.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="필터"
        className={`relative rounded-md p-1.5 md:hidden ${
          filterActive ? "text-fg" : "text-fg-muted"
        } hover:bg-bg-hover`}
      >
        <FilterIcon />
        {filterActive && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-fg">
            {count}
          </span>
        )}
      </button>
      {open && <FilterSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function FilterSheet({ onClose }: { onClose: () => void }) {
  const { categories, tags, filter, toggleCategoryFilter, toggleTagFilter, clearFilter } =
    useStore();

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end bg-[var(--overlay)]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full rounded-t-2xl border border-line bg-bg px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">필터</span>
          <div className="flex items-center gap-3">
            <button onClick={clearFilter} className="text-sm text-fg-muted">
              초기화
            </button>
            <button onClick={onClose} aria-label="닫기" className="text-fg-muted">
              <XIcon />
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-fg-faint">카테고리</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {categories.length === 0 && <span className="text-xs text-fg-faint">없음</span>}
          {categories.map((c) => (
            <SheetChip
              key={c.id}
              selected={filter.categoryIds.includes(c.id)}
              onClick={() => toggleCategoryFilter(c.id)}
            >
              <span className="size-2.5 rounded-[3px]" style={{ background: colorVar(c.color) }} />
              {c.name}
            </SheetChip>
          ))}
        </div>
        <p className="mb-2 text-xs text-fg-faint">태그</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-xs text-fg-faint">없음</span>}
          {tags.map((t) => (
            <SheetChip
              key={t.id}
              selected={filter.tagIds.includes(t.id)}
              onClick={() => toggleTagFilter(t.id)}
            >
              <HashIcon width={12} height={12} style={{ color: colorVar(t.color) }} />
              {t.name}
            </SheetChip>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SheetChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
        selected ? "border-accent bg-accent text-accent-fg" : "border-line text-fg-muted"
      }`}
    >
      {children}
    </button>
  );
}
