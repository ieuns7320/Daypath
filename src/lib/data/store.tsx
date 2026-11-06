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
import type { CalendarEvent, Category, Snapshot, Tag } from "../types";
import { repo } from "./repo";

type Store = Snapshot & {
  mode: "local" | "cloud";
  loading: boolean;
  error: string | null;
  clearError(): void;
  saveEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  saveCategory(category: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveTag(tag: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>({ events: [], categories: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSnap(await repo.load());
    } catch (e) {
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

  const store = useMemo<Store>(
    () => ({
      ...snap,
      mode: repo.mode,
      loading,
      error,
      clearError: () => setError(null),

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

      saveCategory: (category) =>
        run(
          (s) => ({ ...s, categories: upsertById(s.categories, category) }),
          () => repo.upsert("categories", category),
        ),
      deleteCategory: (id) => {
        // 이 카테고리를 쓰던 일정은 "카테고리 없음"이 된다.
        const affected = snap.events
          .filter((e) => e.category_id === id)
          .map((e) => ({ ...e, category_id: null }));
        return run(
          (s) => ({
            ...s,
            categories: s.categories.filter((c) => c.id !== id),
            events: s.events.map((e) => (e.category_id === id ? { ...e, category_id: null } : e)),
          }),
          async () => {
            await repo.upsertMany("events", affected);
            await repo.remove("categories", id);
          },
        );
      },

      saveTag: (tag) =>
        run(
          (s) => ({ ...s, tags: upsertById(s.tags, tag) }),
          () => repo.upsert("tags", tag),
        ),
      deleteTag: (id) => {
        // 일정에 붙어 있던 태그도 함께 떼어낸다.
        const affected = snap.events
          .filter((e) => e.tag_ids.includes(id))
          .map((e) => ({ ...e, tag_ids: e.tag_ids.filter((t) => t !== id) }));
        return run(
          (s) => ({
            ...s,
            tags: s.tags.filter((t) => t.id !== id),
            events: s.events.map((e) =>
              e.tag_ids.includes(id) ? { ...e, tag_ids: e.tag_ids.filter((t) => t !== id) } : e,
            ),
          }),
          async () => {
            await repo.upsertMany("events", affected);
            await repo.remove("tags", id);
          },
        );
      },
    }),
    [snap, loading, error, run],
  );

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
