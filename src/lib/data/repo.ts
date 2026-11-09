import {
  NO_RECURRENCE,
  type CalendarEvent,
  type Category,
  type Kind,
  type Snapshot,
  type Tag,
  type Task,
} from "../types";
import { isColorKey } from "../palette";
import { supabase } from "./supabase";

export type TableRow = {
  events: CalendarEvent;
  tasks: Task;
  categories: Category;
  tags: Tag;
};
export type TableName = keyof TableRow;

/** 저장소 추상화: 로컬(브라우저) 또는 클라우드(Supabase). */
export interface Repo {
  mode: "local" | "cloud";
  load(): Promise<Snapshot>;
  upsert<T extends TableName>(table: T, row: TableRow[T]): Promise<void>;
  upsertMany<T extends TableName>(table: T, rows: TableRow[T][]): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** 다른 기기/탭에서 바뀌면 onChange 호출. 반환값은 구독 해제 함수. */
  subscribe(onChange: () => void): () => void;
}

const EMPTY: Snapshot = { events: [], tasks: [], categories: [], tags: [] };

/** 일부 테이블이 없을 때: 나머지 데이터(partial)는 정상으로 쓰고 메시지만 보여준다. */
export class MissingTableError extends Error {
  constructor(
    message: string,
    public partial: Snapshot,
  ) {
    super(message);
  }
}

/* ---------------- 로컬 모드 ---------------- */

const LOCAL_KEY = "daypath:v1";

function readLocal(): Snapshot {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    return {
      // 예전 데이터에는 반복 칸이 없으므로 기본값을 채운다
      events: (parsed.events ?? []).map((e) => ({ ...NO_RECURRENCE, ...e })),
      tasks: parsed.tasks ?? [],
      // 예전 카테고리·태그에는 kind가 없다 → 캘린더용
      categories: (parsed.categories ?? []).map((c) => ({ ...c, kind: c.kind ?? "event" })),
      tags: (parsed.tags ?? []).map((t) => ({ ...t, kind: t.kind ?? "event" })),
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function writeLocal(snapshot: Snapshot) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
  } catch {
    // 저장 공간 부족 / 사생활 보호 모드 등: 메모리 상태만 유지
  }
}

const localRepo: Repo = {
  mode: "local",
  async load() {
    return readLocal();
  },
  async upsert(table, row) {
    const snap = readLocal();
    const list = snap[table] as { id: string }[];
    const i = list.findIndex((r) => r.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
    writeLocal(snap);
  },
  async upsertMany(table, rows) {
    for (const row of rows) await localRepo.upsert(table, row);
  },
  async remove(table, id) {
    const snap = readLocal();
    // 반복 일정을 지우면 떼어 낸 회차도 함께 (DB의 on delete cascade와 같게)
    (snap[table] as { id: string; series_id?: string | null }[]) = (
      snap[table] as { id: string; series_id?: string | null }[]
    ).filter((r) => r.id !== id && r.series_id !== id);
    writeLocal(snap);
  },
  subscribe(onChange) {
    const handler = (e: StorageEvent) => {
      if (e.key === LOCAL_KEY) onChange();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};

/* ---------------- 클라우드 모드 (Supabase) ---------------- */

function toEvent(r: Record<string, unknown>): CalendarEvent {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    start_at: String(r.start_at),
    end_at: String(r.end_at),
    all_day: Boolean(r.all_day),
    category_id: (r.category_id as string | null) ?? null,
    tag_ids: (r.tag_ids as string[] | null) ?? [],
    memo: String(r.memo ?? ""),
    rrule: (r.rrule as string | null) ?? null,
    exdates: (r.exdates as string[] | null) ?? [],
    series_id: (r.series_id as string | null) ?? null,
    original_date: (r.original_date as string | null) ?? null,
  };
}

/** 003_recurrence.sql 실행 전 DB에는 반복 칸이 없으므로, 저장할 때 그 칸을 뺀다 */
function withoutRecurrence(e: CalendarEvent) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rrule, exdates, series_id, original_date, ...rest } = e;
  return rest;
}

function toTask(r: Record<string, unknown>): Task {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    due_date: (r.due_date as string | null) ?? null,
    scheduled_start: (r.scheduled_start as string | null) ?? null,
    scheduled_end: (r.scheduled_end as string | null) ?? null,
    done: Boolean(r.done),
    done_at: (r.done_at as string | null) ?? null,
    category_id: (r.category_id as string | null) ?? null,
    tag_ids: (r.tag_ids as string[] | null) ?? [],
    memo: String(r.memo ?? ""),
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

const toKind = (v: unknown): Kind => (v === "task" ? "task" : "event");

function toCategory(r: Record<string, unknown>): Category {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: isColorKey(r.color) ? r.color : "gray",
    sort_order: Number(r.sort_order ?? 0),
    kind: toKind(r.kind),
  };
}

function toTag(r: Record<string, unknown>): Tag {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: isColorKey(r.color) ? r.color : "gray",
    kind: toKind(r.kind),
  };
}

/** 004_split_categories.sql 실행 전 DB에는 kind 칸이 없으므로, 저장할 때 그 칸을 뺀다 */
function withoutKind<T extends { kind: Kind }>(row: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...rest } = row;
  return rest;
}

function cloudRepo(): Repo {
  const db = supabase!;
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  // 나중에 추가한 칸이 DB에 있는지 (load 때 확인). 없으면 저장할 때 그 칸을 뺀다.
  let hasRecurrence = true;
  let hasKind = true;
  const prepare = <T extends TableName>(table: T, row: TableRow[T]): TableRow[T] => {
    if (table === "events" && !hasRecurrence)
      return withoutRecurrence(row as CalendarEvent) as unknown as TableRow[T];
    if ((table === "categories" || table === "tags") && !hasKind)
      return withoutKind(row as Category | Tag) as unknown as TableRow[T];
    return row;
  };
  return {
    mode: "cloud",
    async load() {
      const [ev, task, cat, tag, rec, kind] = await Promise.all([
        db.from("events").select("*"),
        db.from("tasks").select("*"),
        db.from("categories").select("*").order("sort_order"),
        db.from("tags").select("*").order("name"),
        db.from("events").select("rrule").limit(1),
        db.from("categories").select("kind").limit(1),
      ]);
      check(ev.error);
      check(cat.error);
      check(tag.error);
      // tasks 테이블이 아직 없으면(2단계 마이그레이션 전) 할 일만 비우고 계속 진행
      if (task.error?.code === "PGRST205") {
        throw new MissingTableError(
          "할 일 테이블이 없어요. Supabase SQL Editor에서 supabase/migrations/002_tasks.sql을 실행해 주세요.",
          {
            events: (ev.data ?? []).map(toEvent),
            tasks: [],
            categories: (cat.data ?? []).map(toCategory),
            tags: (tag.data ?? []).map(toTag),
          },
        );
      }
      check(task.error);
      const snapshot: Snapshot = {
        events: (ev.data ?? []).map(toEvent),
        tasks: (task.data ?? []).map(toTask),
        categories: (cat.data ?? []).map(toCategory),
        tags: (tag.data ?? []).map(toTag),
      };
      // 나중에 추가한 칸이 없으면(마이그레이션 전) 그 기능 없이 계속 쓰고 안내만 한다
      hasRecurrence = !rec.error;
      hasKind = !kind.error;
      const missing = [
        rec.error && "003_recurrence.sql(반복 일정)",
        kind.error && "004_split_categories.sql(캘린더·할 일 카테고리 분리)",
      ].filter(Boolean);
      if (missing.length) {
        throw new MissingTableError(
          `DB에 새 칸이 없어요. Supabase SQL Editor에서 supabase/migrations/의 ${missing.join(", ")}을 순서대로 실행해 주세요.`,
          snapshot,
        );
      }
      return snapshot;
    },
    async upsert(table, row) {
      const { error } = await db.from(table).upsert(prepare(table, row));
      check(error);
    },
    async upsertMany(table, rows) {
      if (rows.length === 0) return;
      const { error } = await db.from(table).upsert(rows.map((r) => prepare(table, r)));
      check(error);
    },
    async remove(table, id) {
      const { error } = await db.from(table).delete().eq("id", id);
      check(error);
    },
    subscribe(onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const debounced = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 300);
      };
      const channel = db
        .channel("daypath-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "tags" }, debounced)
        .subscribe();
      return () => {
        clearTimeout(timer);
        db.removeChannel(channel);
      };
    },
  };
}

export const repo: Repo = supabase ? cloudRepo() : localRepo;
