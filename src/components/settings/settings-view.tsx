"use client";

import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { newId, useStore } from "@/lib/data/store";
import { supabase } from "@/lib/data/supabase";
import { COLOR_KEYS, COLOR_LABELS, colorVar, type ColorKey } from "@/lib/palette";
import { HashIcon, XIcon } from "../icons";

export function SettingsView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-10 px-4 py-8 md:px-6">
        <h1 className="text-lg font-semibold tracking-tight">설정</h1>
        <ThemeSection />
        <CategorySection />
        <TagSection />
        <AccountSection />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/* ---------- 테마 ---------- */

const subscribeNoop = () => () => {};

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  // 서버 렌더링 중에는 테마를 알 수 없어서, 마운트 후에만 선택 상태를 표시
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const options = [
    { value: "system", label: "시스템" },
    { value: "light", label: "라이트" },
    { value: "dark", label: "다크" },
  ];
  return (
    <Section title="테마">
      <div className="inline-flex rounded-lg bg-bg-hover p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            className={`rounded-md px-4 py-1.5 text-sm ${
              mounted && theme === o.value ? "bg-bg font-medium shadow-sm" : "text-fg-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ---------- 카테고리 ---------- */

function CategorySection() {
  const { categories, saveCategory, deleteCategory } = useStore();
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Section title="카테고리">
      <p className="-mt-2 mb-3 text-xs text-fg-faint">
        일정마다 하나만 고를 수 있고, 캘린더 블록 색이 돼요.
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {sorted.map((c) => (
          <ItemRow
            key={c.id}
            name={c.name}
            color={c.color}
            marker={<span className="size-3 rounded-[3px]" style={{ background: colorVar(c.color) }} />}
            onRename={(name) => saveCategory({ ...c, name })}
            onRecolor={(color) => saveCategory({ ...c, color })}
            onDelete={() => {
              if (confirm(`'${c.name}' 카테고리를 삭제할까요?\n이 카테고리의 일정은 '카테고리 없음'이 돼요.`))
                void deleteCategory(c.id);
            }}
          />
        ))}
        <AddRow
          placeholder="새 카테고리"
          onAdd={(name, color) =>
            saveCategory({
              id: newId(),
              name,
              color,
              sort_order: (sorted.at(-1)?.sort_order ?? 0) + 1,
            })
          }
        />
      </ul>
    </Section>
  );
}

/* ---------- 태그 ---------- */

function TagSection() {
  const { tags, saveTag, deleteTag } = useStore();
  return (
    <Section title="태그">
      <p className="-mt-2 mb-3 text-xs text-fg-faint">
        일정에 여러 개 붙일 수 있고, 블록 안에 작은 점으로 표시돼요.
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {tags.map((t) => (
          <ItemRow
            key={t.id}
            name={t.name}
            color={t.color}
            marker={<HashIcon width={14} height={14} style={{ color: colorVar(t.color) }} />}
            onRename={(name) => saveTag({ ...t, name })}
            onRecolor={(color) => saveTag({ ...t, color })}
            onDelete={() => {
              if (confirm(`'${t.name}' 태그를 삭제할까요?\n일정에 붙어 있던 이 태그도 함께 떼어져요.`))
                void deleteTag(t.id);
            }}
          />
        ))}
        <AddRow
          placeholder="새 태그"
          onAdd={(name, color) => saveTag({ id: newId(), name, color })}
        />
      </ul>
    </Section>
  );
}

/* ---------- 공통 행 ---------- */

function ItemRow({
  name,
  color,
  marker,
  onRename,
  onRecolor,
  onDelete,
}: {
  name: string;
  color: ColorKey;
  marker: ReactNode;
  onRename: (name: string) => void;
  onRecolor: (color: ColorKey) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const [picking, setPicking] = useState(false);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    else setDraft(name);
  };

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPicking((p) => !p)}
          aria-label="색상 바꾸기"
          className="flex size-6 items-center justify-center rounded hover:bg-bg-hover"
        >
          {marker}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button onClick={onDelete} aria-label="삭제" className="text-fg-faint hover:text-danger">
          <XIcon width={16} height={16} />
        </button>
      </div>
      {picking && (
        <ColorPicker
          value={color}
          onChange={(c) => {
            onRecolor(c);
            setPicking(false);
          }}
        />
      )}
    </li>
  );
}

function AddRow({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string, color: ColorKey) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorKey>("blue");

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAdd(n, color);
    setName("");
  }

  return (
    <li className="px-3 py-2">
      <form onSubmit={submit} className="flex items-center gap-3">
        <span className="flex size-6 items-center justify-center">
          <span className="size-3 rounded-full border border-dashed border-fg-faint" />
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-faint"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="text-sm text-fg-muted hover:text-fg disabled:opacity-40"
        >
          추가
        </button>
      </form>
      {name.trim() && <ColorPicker value={color} onChange={setColor} />}
    </li>
  );
}

function ColorPicker({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-label={COLOR_LABELS[key]}
          title={COLOR_LABELS[key]}
          className={`size-6 rounded-full ${
            value === key ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""
          }`}
          style={{ background: colorVar(key) }}
        />
      ))}
    </div>
  );
}

/* ---------- 계정 ---------- */

function AccountSection() {
  const { mode } = useStore();
  return (
    <Section title="계정 · 동기화">
      {mode === "local" ? (
        <p className="text-sm leading-6 text-fg-muted">
          지금은 <b className="font-medium text-fg">로컬 모드</b>예요. 데이터가 이 브라우저에만
          저장되고 다른 기기와 동기화되지 않아요. Supabase를 연결하면 클라우드 동기화가 켜져요.
        </p>
      ) : (
        <button
          onClick={() => supabase?.auth.signOut()}
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-bg-hover"
        >
          로그아웃
        </button>
      )}
    </Section>
  );
}
