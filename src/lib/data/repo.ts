import type { CalendarEvent, Category, Snapshot, Tag } from "../types";
import { isColorKey } from "../palette";
import { supabase } from "./supabase";

export type TableRow = {
  events: CalendarEvent;
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

const EMPTY: Snapshot = { events: [], categories: [], tags: [] };

/* ---------------- 로컬 모드 ---------------- */

const LOCAL_KEY = "daypath:v1";

function readLocal(): Snapshot {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    return {
      events: parsed.events ?? [],
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
      const [ev, cat, tag] = await Promise.all([
        db.from("events").select("*"),
        db.from("categories").select("*").order("sort_order"),
        db.from("tags").select("*").order("name"),
      ]);
      check(ev.error);
      check(cat.error);
      check(tag.error);
      return {
        events: (ev.data ?? []).map(toEvent),
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
