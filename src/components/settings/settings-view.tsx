"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useNotify } from "@/lib/data/notify";
import { newId, useScoped, useStore } from "@/lib/data/store";
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from "@/lib/push";
import { ReminderField } from "../editor/item-editor";
import { TimePicker } from "../pickers";
import { getInstallState, promptInstall, subscribeInstall, type InstallState } from "@/lib/pwa";
import { supabase } from "@/lib/data/supabase";
import { COLOR_KEYS, COLOR_LABELS, colorVar, type ColorKey } from "@/lib/palette";
import { MONEY_TYPE_LABEL, sortMoneyCategories } from "@/lib/money";
import type { Kind, MoneyType } from "@/lib/types";
import { useMoneyCategorySeed } from "../money/seed";
import { HashIcon, XIcon } from "../icons";

export function SettingsView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-10 px-4 py-8 md:px-6">
        <h1 className="text-lg font-semibold tracking-tight">설정</h1>
        <ThemeSection />
        <LabelsSection />
        <InstallSection />
        <NotifySection />
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

/* ---------- 카테고리·태그: [캘린더 | 할 일] 전환 ---------- */

const KIND_LABEL: Record<Kind, string> = { event: "캘린더", task: "할 일" };
type LabelTab = Kind | "money";
const TAB_LABEL: Record<LabelTab, string> = { ...KIND_LABEL, money: "가계부" };

/** 캘린더용과 할 일용 카테고리·태그는 따로 관리한다. 위 전환으로 고른 쪽만 보여 준다. */
function LabelsSection() {
  const [kind, setKind] = useState<LabelTab>("event");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">카테고리·태그</h2>
        <div className="inline-flex rounded-lg bg-bg-hover p-0.5" role="tablist" aria-label="어디에 쓰는지">
          {(["event", "task", "money"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-md px-4 py-1.5 text-sm ${
                kind === k ? "bg-bg font-medium shadow-sm" : "text-fg-muted"
              }`}
            >
              {TAB_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-faint">
          캘린더·할 일·가계부는 분류를 따로 써요. 여기서 고른 쪽만 보여요.
        </p>
      </div>
      {kind === "money" ? (
        <MoneyCategories />
      ) : (
        <>
          <CategorySection kind={kind} />
          <TagSection kind={kind} />
        </>
      )}
    </div>
  );
}

/* ---------- 가계부 분류 ---------- */

function MoneyCategories() {
  const { moneyAvailable } = useStore();
  useMoneyCategorySeed();
  if (!moneyAvailable)
    return (
      <p className="text-sm text-fg-muted">
        Supabase SQL Editor에서 <code className="rounded bg-bg-hover px-1 text-xs">008_money.sql</code>을 실행하면 쓸 수 있어요.
      </p>
    );
  return (
    <>
      <MoneyCategorySection type="expense" />
      <MoneyCategorySection type="income" />
    </>
  );
}

function MoneyCategorySection({ type }: { type: MoneyType }) {
  const { money_categories, saveMoneyCategory, deleteMoneyCategory } = useStore();
  const list = sortMoneyCategories(money_categories).filter((c) => c.type === type);
  return (
    <Section title={`${MONEY_TYPE_LABEL[type]} 분류`}>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.map((c) => (
          <ItemRow
            key={c.id}
            name={c.name}
            color={c.color}
            marker={<span className="size-3 rounded-[3px]" style={{ background: colorVar(c.color) }} />}
            onRename={(name) => saveMoneyCategory({ ...c, name })}
            onRecolor={(color) => saveMoneyCategory({ ...c, color })}
            deleteNote="이 분류의 기록은 '분류 없음'이 돼요."
            onDelete={() => void deleteMoneyCategory(c.id)}
          />
        ))}
        <AddRow
          placeholder="새 분류"
          onAdd={(name, color) =>
            saveMoneyCategory({
              id: newId(),
              name,
              color,
              type,
              sort_order: Math.max(-1, ...money_categories.map((m) => m.sort_order)) + 1,
            })
          }
        />
      </ul>
    </Section>
  );
}

function CategorySection({ kind }: { kind: Kind }) {
  const { saveCategory, deleteCategory } = useStore();
  const { categories: sorted } = useScoped(kind);
  const item = kind === "event" ? "일정" : "할 일";

  return (
    <Section title={`${KIND_LABEL[kind]} 카테고리`}>
      <p className="-mt-2 mb-3 text-xs text-fg-faint">
        {kind === "event"
          ? "일정마다 하나만 고를 수 있고, 캘린더 블록 테두리 색이 돼요."
          : "할 일마다 하나만 고를 수 있고, 할 일 탭에서 이 순서대로 묶여요."}
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
            deleteNote={`이 카테고리의 ${item}은 '카테고리 없음'이 돼요.`}
            onDelete={() => void deleteCategory(c.id)}
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
              kind,
            })
          }
        />
      </ul>
    </Section>
  );
}

/* ---------- 태그 ---------- */

function TagSection({ kind }: { kind: Kind }) {
  const { saveTag, deleteTag } = useStore();
  const { tags } = useScoped(kind);
  const item = kind === "event" ? "일정" : "할 일";
  return (
    <Section title={`${KIND_LABEL[kind]} 태그`}>
      <p className="-mt-2 mb-3 text-xs text-fg-faint">
        {item}에 여러 개 붙일 수 있고, 제목 아래 ● 이름으로 표시돼요.
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
            deleteNote={`${item}에 붙어 있던 이 태그도 함께 떼어져요.`}
            onDelete={() => void deleteTag(t.id)}
          />
        ))}
        <AddRow
          placeholder="새 태그"
          onAdd={(name, color) => saveTag({ id: newId(), name, color, kind })}
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
  deleteNote,
  onDelete,
}: {
  name: string;
  color: ColorKey;
  marker: ReactNode;
  onRename: (name: string) => void;
  onRecolor: (color: ColorKey) => void;
  deleteNote: string;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const [picking, setPicking] = useState(false);
  // 브라우저 confirm()은 앱 안 브라우저·PWA에서 막히기도 해서, 행 안에서 한 번 더 묻는다.
  const [confirming, setConfirming] = useState(false);

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
        <button
          onClick={() => setConfirming((v) => !v)}
          aria-label="삭제"
          aria-expanded={confirming}
          className={confirming ? "text-danger" : "text-fg-faint hover:text-danger"}
        >
          <XIcon width={16} height={16} />
        </button>
      </div>
      {confirming && (
        <div className="mt-2 flex items-center gap-2 pl-9 text-xs">
          <span className="min-w-0 flex-1 text-fg-muted">
            <b className="font-medium text-fg">&apos;{name}&apos;</b>을(를) 삭제할까요? {deleteNote}
          </span>
          <button
            onClick={() => setConfirming(false)}
            className="shrink-0 rounded-md px-2 py-1 text-fg-muted hover:bg-bg-hover"
          >
            취소
          </button>
          <button
            onClick={onDelete}
            className="shrink-0 rounded-md bg-danger px-2 py-1 font-medium text-white hover:opacity-90"
          >
            삭제
          </button>
        </div>
      )}
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

/* ---------- 앱 설치 ---------- */

function InstallSection() {
  // 서버 렌더링 중에는 알 수 없으므로 null
  const state = useSyncExternalStore<InstallState | null>(subscribeInstall, getInstallState, () => null);
  if (!state) return null;
  return (
    <Section title="앱 설치">
      {state === "installed" ? (
        <p className="text-sm text-fg-muted">설치되어 있어요. 홈 화면·작업 표시줄에서 열 수 있어요.</p>
      ) : state === "prompt" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void promptInstall()}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-bg-hover"
          >
            앱 설치
          </button>
          <p className="text-sm text-fg-muted">홈 화면·작업 표시줄에서 바로 열 수 있어요.</p>
        </div>
      ) : state === "ios" ? (
        <p className="text-sm leading-6 text-fg-muted">
          Safari 아래(아이패드는 위)의 <b className="font-medium text-fg">공유</b> 버튼 →{" "}
          <b className="font-medium text-fg">홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요. 알림을
          받으려면 이렇게 설치해야 해요.
        </p>
      ) : (
        <p className="text-sm leading-6 text-fg-muted">
          브라우저 메뉴에서 <b className="font-medium text-fg">앱 설치</b> 또는{" "}
          <b className="font-medium text-fg">홈 화면에 추가</b>를 고르면 앱처럼 쓸 수 있어요. (주소창
          오른쪽 설치 아이콘이 보이면 그것을 눌러도 돼요.)
        </p>
      )}
    </Section>
  );
}

/* ---------- 알림 ---------- */

const btnCls = "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-bg-hover disabled:opacity-50";

function NotifySection() {
  const { mode } = useStore();
  const { settings, available, saveSettings } = useNotify();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    void getPushState().then(setPush);
  }, [available]);

  if (mode === "local") {
    return (
      <Section title="알림">
        <p className="text-sm text-fg-muted">알림은 로그인해서 클라우드 동기화를 쓸 때만 받을 수 있어요.</p>
      </Section>
    );
  }
  if (!available) {
    return (
      <Section title="알림">
        <p className="text-sm leading-6 text-fg-muted">
          Supabase SQL Editor에서 <code className="text-fg">supabase/migrations/005_notifications.sql</code>을
          실행하면 알림을 쓸 수 있어요.
        </p>
      </Section>
    );
  }

  /** 버튼 동작 공통: 실행 중 표시 + 결과 메시지 + 상태 새로 읽기 */
  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setPush(await getPushState());
      setBusy(false);
    }
  };

  return (
    <Section title="알림">
      <div className="space-y-5">
        {/* 이 기기 */}
        <div className="space-y-2">
          {push === "needs-install" ? (
            <p className="text-sm leading-6 text-fg-muted">
              iPhone·iPad는 <b className="font-medium text-fg">홈 화면에 추가한 앱</b>에서만 알림을 받을 수
              있어요. 위 &lsquo;앱 설치&rsquo;대로 추가한 뒤 그 앱에서 알림을 켜 주세요.
            </p>
          ) : push === "unsupported" ? (
            <p className="text-sm text-fg-muted">이 브라우저는 알림을 지원하지 않아요.</p>
          ) : push === "denied" ? (
            <p className="text-sm leading-6 text-fg-muted">
              알림이 차단되어 있어요. 브라우저(또는 기기 설정 &gt; 알림)에서 Daypath 알림을 허용한 뒤 다시
              열어 주세요.
            </p>
          ) : push === "on" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm">이 기기에서 알림을 받고 있어요.</span>
              <button
                disabled={busy}
                onClick={() => void act(sendTestPush, "1분 안에 테스트 알림이 와요.")}
                className={btnCls}
              >
                테스트 알림
              </button>
              <button
                disabled={busy}
                onClick={() => void act(disablePush, "이 기기의 알림을 껐어요.")}
                className={`${btnCls} text-fg-muted`}
              >
                끄기
              </button>
            </div>
          ) : push === "off" ? (
            <button
              disabled={busy}
              onClick={() => void act(enablePush, "이 기기에서 알림을 켰어요.")}
              className={btnCls}
            >
              이 기기에서 알림 켜기
            </button>
          ) : null}
          {message && <p className="text-xs text-fg-muted">{message}</p>}
          <p className="text-xs leading-5 text-fg-faint">
            알림은 기기마다 켜요. 아래 설정은 모든 기기에 같이 적용돼요. 앱을 30일 넘게 열지 않으면 그
            뒤 알림은 멈춰요.
          </p>
        </div>

        {/* 기본값 (모든 기기 공통) */}
        <div className="space-y-3">
          <ReminderField
            label="새 일정"
            allDay={false}
            alldayTime={settings.allday_time}
            value={settings.event_reminders}
            onChange={(v) => void saveSettings({ event_reminders: [...v].sort((a, b) => a - b) })}
          />
          <TimeRow
            label="종일 일정"
            hint="당일 알림 시각"
            value={settings.allday_time}
            onChange={(v) => void saveSettings({ allday_time: v })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-fg-faint">할 일</span>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={settings.task_digest}
                onChange={(e) => void saveSettings({ task_digest: e.target.checked })}
                className="size-4 accent-[var(--accent)]"
              />
              하는 날
            </label>
            <TimePicker
              value={settings.task_time}
              disabled={!settings.task_digest}
              onChange={(v) => void saveSettings({ task_time: v })}
              ariaLabel="할 일 알림 시각"
              className="!py-1"
            />
            <span className="text-xs text-fg-faint">그날 할 일을 묶어서 한 번</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function TimeRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-fg-faint">{label}</span>
      <TimePicker value={value} onChange={onChange} ariaLabel={`${label} ${hint}`} className="!py-1" />
      <span className="text-xs text-fg-faint">{hint}</span>
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
