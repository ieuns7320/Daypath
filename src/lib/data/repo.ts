import type { CalendarEvent, Category, Snapshot, Tag, Task } from "../types";
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
      events: parsed.events ?? [],
      tasks: parsed.tasks ?? [],
      categories: parsed.categories ?? [],
      tags: parsed.tags ?? [],
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
    (snap[table] as { id: string }[]) = (snap[table] as { id: string }[]).filter(
      (r) => r.id !== id,
    );
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
  };
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

function toCategory(r: Record<string, unknown>): Category {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: isColorKey(r.color) ? r.color : "gray",
    sort_order: Number(r.sort_order ?? 0),
  };
}

function toTag(r: Record<string, unknown>): Tag {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: isColorKey(r.color) ? r.color : "gray",
  };
}

function cloudRepo(): Repo {
  const db = supabase!;
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    mode: "cloud",
    async load() {
      const [ev, task, cat, tag] = await Promise.all([
        db.from("events").select("*"),
        db.from("tasks").select("*"),
        db.from("categories").select("*").order("sort_order"),
        db.from("tags").select("*").order("name"),
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
      return {
        events: (ev.data ?? []).map(toEvent),
        tasks: (task.data ?? []).map(toTask),
        categories: (cat.data ?? []).map(toCategory),
        tags: (tag.data ?? []).map(toTag),
      };
    },
    async upsert(table, row) {
      const { error } = await db.from(table).upsert(row);
      check(error);
    },
    async upsertMany(table, rows) {
      if (rows.length === 0) return;
      const { error } = await db.from(table).upsert(rows);
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
