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
import type { CalendarEvent, Category, Snapshot, Tag, Task } from "../types";
import { MissingTableError, repo } from "./repo";

/** 카테고리/태그 필터. 같은 묶음 안은 "하나라도 맞으면", 두 묶음 사이는 "둘 다 맞아야" 통과. */
export type Filter = { categoryIds: string[]; tagIds: string[] };

type Filterable = { category_id: string | null; tag_ids: string[] };

type Store = Snapshot & {
  mode: "local" | "cloud";
  loading: boolean;
  error: string | null;
  clearError(): void;

  saveEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  toggleTask(id: string): Promise<void>;
  saveCategory(category: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveTag(tag: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;

  filter: Filter;
  filterActive: boolean;
  toggleCategoryFilter(id: string): void;
  toggleTagFilter(id: string): void;
  clearFilter(): void;
  matchesFilter(item: Filterable): boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);

  const reload = useCallback(async () => {
    try {
      setSnap(await repo.load());
    } catch (e) {
      if (e instanceof MissingTableError) setSnap(e.partial);
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

  // 지워진 카테고리/태그가 필터에 남아 있으면 정리
  const liveFilter = useMemo<Filter>(() => {
    const cats = new Set(snap.categories.map((c) => c.id));
    const tags = new Set(snap.tags.map((t) => t.id));
    return {
      categoryIds: filter.categoryIds.filter((id) => cats.has(id)),
      tagIds: filter.tagIds.filter((id) => tags.has(id)),
    };
  }, [filter, snap.categories, snap.tags]);

  const store = useMemo<Store>(() => {
    const matchesFilter = (item: Filterable) => {
      const { categoryIds, tagIds } = liveFilter;
      if (categoryIds.length && !(item.category_id && categoryIds.includes(item.category_id)))
        return false;
      if (tagIds.length && !item.tag_ids.some((t) => tagIds.includes(t))) return false;
      return true;
    };

    return {
      ...snap,
      mode: repo.mode,
      loading,
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
          (s) => ({ ...s, events: s.events.filter((e) => e.id !== id) }),
          () => repo.remove("events", id),
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

      /* 필터 */
      filter: liveFilter,
      filterActive: liveFilter.categoryIds.length > 0 || liveFilter.tagIds.length > 0,
      toggleCategoryFilter: (id) =>
        setFilter((f) => ({ ...f, categoryIds: toggleIn(f.categoryIds, id) })),
      toggleTagFilter: (id) => setFilter((f) => ({ ...f, tagIds: toggleIn(f.tagIds, id) })),
      clearFilter: () => setFilter(NO_FILTER),
      matchesFilter,
    };
  }, [snap, loading, error, run, liveFilter]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <DataProvider>");
  return store;
}

export function newId(): string {
  return crypto.randomUUID();
}
