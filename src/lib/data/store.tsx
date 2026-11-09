"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CalendarEvent, Category, Kind, Snapshot, Tag, Task } from "../types";
import type { EventChanges } from "../series";
import { MissingTableError, repo } from "./repo";

/** 카테고리/태그 필터. 같은 묶음 안은 "하나라도 맞으면", 두 묶음 사이는 "둘 다 맞아야" 통과. */
export type Filter = { categoryIds: string[]; tagIds: string[] };

type Filterable = { category_id: string | null; tag_ids: string[] };

/**
 * 캘린더용 / 할 일용 카테고리·태그와 그 필터.
 * 캘린더 화면은 useScoped("event"), 할 일 화면은 useScoped("task")만 쓴다.
 */
export type Scoped = {
  kind: Kind;
  categories: Category[];
  tags: Tag[];
  filter: Filter;
  filterActive: boolean;
  toggleCategoryFilter(id: string): void;
  toggleTagFilter(id: string): void;
  clearFilter(): void;
  matchesFilter(item: Filterable): boolean;
};

type Store = Snapshot & {
  mode: "local" | "cloud";
  loading: boolean;
  /** 데이터를 한 번이라도 제대로 불러왔는지 (불러오기 실패로 빈 상태면 false) */
  ready: boolean;
  error: string | null;
  clearError(): void;

  saveEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  /** 여러 일정을 한 번에 저장·삭제 (반복 일정의 회차 수정·삭제) */
  applyEventChanges(changes: EventChanges): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  toggleTask(id: string): Promise<void>;
  saveCategory(category: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveTag(tag: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;

  /** 캘린더용(event) / 할 일용(task) 카테고리·태그와 필터 (필터도 따로) */
  scoped: Record<Kind, Scoped>;
};

const StoreContext = createContext<Store | null>(null);

const EMPTY: Snapshot = { events: [], tasks: [], categories: [], tags: [] };
const NO_FILTER: Filter = { categoryIds: [], tagIds: [] };

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<Kind, Filter>>({ event: NO_FILTER, task: NO_FILTER });

  const reload = useCallback(async () => {
    try {
      setSnap(await repo.load());
      setReady(true);
    } catch (e) {
      if (e instanceof MissingTableError) {
        setSnap(e.partial);
        setReady(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 최초 로드 + 다른 기기/탭 변경 구독
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return repo.subscribe(() => void reload());
  }, [reload]);

  /** 화면을 먼저 바꾸고(낙관적 업데이트) 저장. 실패하면 서버 상태로 되돌린다. */
  const run = useCallback(
    async (optimistic: (s: Snapshot) => Snapshot, persist: () => Promise<void>) => {
      setSnap(optimistic);
      try {
        await persist();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        await reload();
      }
    },
    [reload],
  );

  /** 한쪽(캘린더 / 할 일)의 카테고리·태그와 필터 */
  const scoped = useMemo<Record<Kind, Scoped>>(() => {
    const make = (kind: Kind): Scoped => {
      const categories = snap.categories
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.sort_order - b.sort_order);
      const tags = snap.tags.filter((t) => t.kind === kind);
      // 지워진 카테고리/태그가 필터에 남아 있으면 빼고 본다
      const cats = new Set(categories.map((c) => c.id));
      const tagSet = new Set(tags.map((t) => t.id));
      const filter: Filter = {
        categoryIds: filters[kind].categoryIds.filter((id) => cats.has(id)),
        tagIds: filters[kind].tagIds.filter((id) => tagSet.has(id)),
      };
      const update = (fn: (f: Filter) => Filter) =>
        setFilters((all) => ({ ...all, [kind]: fn(all[kind]) }));
      return {
        kind,
        categories,
        tags,
        filter,
        filterActive: filter.categoryIds.length > 0 || filter.tagIds.length > 0,
        toggleCategoryFilter: (id) =>
          update((f) => ({ ...f, categoryIds: toggleIn(f.categoryIds, id) })),
        toggleTagFilter: (id) => update((f) => ({ ...f, tagIds: toggleIn(f.tagIds, id) })),
        clearFilter: () => update(() => NO_FILTER),
        matchesFilter: (item) => {
          if (
            filter.categoryIds.length &&
            !(item.category_id && filter.categoryIds.includes(item.category_id))
          )
            return false;
          if (filter.tagIds.length && !item.tag_ids.some((t) => filter.tagIds.includes(t)))
            return false;
          return true;
        },
      };
    };
    return { event: make("event"), task: make("task") };
  }, [snap.categories, snap.tags, filters]);

  const store = useMemo<Store>(() => {
    return {
      ...snap,
      mode: repo.mode,
      loading,
      ready,
      error,
      clearError: () => setError(null),

      /* 일정 */
      saveEvent: (event) =>
        run(
          (s) => ({ ...s, events: upsertById(s.events, event) }),
          () => repo.upsert("events", event),
        ),
      deleteEvent: (id) =>
        run(
          // 반복 일정이면 떼어 낸 회차도 함께 지운다 (DB는 on delete cascade)
          (s) => ({ ...s, events: s.events.filter((e) => e.id !== id && e.series_id !== id) }),
          () => repo.remove("events", id),
        ),
      applyEventChanges: ({ upserts, removes }) =>
        run(
          (s) => {
            let events = s.events.filter((e) => !removes.includes(e.id));
            for (const e of upserts) events = upsertById(events, e);
            return { ...s, events };
          },
          async () => {
            await repo.upsertMany("events", upserts);
            for (const id of removes) await repo.remove("events", id);
          },
        ),

      /* 할 일 */
      saveTask: (task) =>
        run(
          (s) => ({ ...s, tasks: upsertById(s.tasks, task) }),
          () => repo.upsert("tasks", task),
        ),
      deleteTask: (id) =>
        run(
          (s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }),
          () => repo.remove("tasks", id),
        ),
      toggleTask: (id) => {
        const task = snap.tasks.find((t) => t.id === id);
        if (!task) return Promise.resolve();
        const next: Task = {
          ...task,
          done: !task.done,
          done_at: task.done ? null : new Date().toISOString(),
        };
        return run(
          (s) => ({ ...s, tasks: upsertById(s.tasks, next) }),
          () => repo.upsert("tasks", next),
        );
      },

      /* 카테고리: 지우면 일정·할 일은 "카테고리 없음" */
      saveCategory: (category) =>
        run(
          (s) => ({ ...s, categories: upsertById(s.categories, category) }),
          () => repo.upsert("categories", category),
        ),
      deleteCategory: (id) => {
        const clear = <T extends Filterable>(x: T): T =>
          x.category_id === id ? { ...x, category_id: null } : x;
        const events = snap.events.filter((e) => e.category_id === id).map(clear);
        const tasks = snap.tasks.filter((t) => t.category_id === id).map(clear);
        return run(
          (s) => ({
            ...s,
            categories: s.categories.filter((c) => c.id !== id),
            events: s.events.map(clear),
            tasks: s.tasks.map(clear),
          }),
          async () => {
            await repo.upsertMany("events", events);
            await repo.upsertMany("tasks", tasks);
            await repo.remove("categories", id);
          },
        );
      },

      /* 태그: 지우면 일정·할 일에서도 떼어낸다 */
      saveTag: (tag) =>
        run(
          (s) => ({ ...s, tags: upsertById(s.tags, tag) }),
          () => repo.upsert("tags", tag),
        ),
      deleteTag: (id) => {
        const strip = <T extends Filterable>(x: T): T =>
          x.tag_ids.includes(id) ? { ...x, tag_ids: x.tag_ids.filter((t) => t !== id) } : x;
        const events = snap.events.filter((e) => e.tag_ids.includes(id)).map(strip);
        const tasks = snap.tasks.filter((t) => t.tag_ids.includes(id)).map(strip);
        return run(
          (s) => ({
            ...s,
            tags: s.tags.filter((t) => t.id !== id),
            events: s.events.map(strip),
            tasks: s.tasks.map(strip),
          }),
          async () => {
            await repo.upsertMany("events", events);
            await repo.upsertMany("tasks", tasks);
            await repo.remove("tags", id);
          },
        );
      },

      scoped,
    };
  }, [snap, loading, ready, error, run, scoped]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <DataProvider>");
  return store;
}

/** 캘린더용("event") 또는 할 일용("task") 카테고리·태그·필터 */
export function useScoped(kind: Kind): Scoped {
  return useStore().scoped[kind];
}

export function newId(): string {
  return crypto.randomUUID();
}
