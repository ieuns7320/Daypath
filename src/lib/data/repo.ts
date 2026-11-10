import {
  NO_RECURRENCE,
  type CalendarEvent,
  type Category,
  type Goal,
  type Kind,
  type Milestone,
  type MoneyBudget,
  type MoneyCategory,
  type MoneyEntry,
  type MoneyRecurring,
  type MoneyType,
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
  goals: Goal;
  milestones: Milestone;
  money_categories: MoneyCategory;
  money_entries: MoneyEntry;
  money_recurring: MoneyRecurring;
  money_budgets: MoneyBudget;
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
  /** 가계부 테이블이 있는지 (008 실행 전이면 false, load 뒤에 정해짐) */
  readonly hasMoney: boolean;
}

export const EMPTY: Snapshot = {
  events: [],
  tasks: [],
  categories: [],
  tags: [],
  goals: [],
  milestones: [],
  money_categories: [],
  money_entries: [],
  money_recurring: [],
  money_budgets: [],
};

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
      // 예전 데이터에는 나중에 생긴 칸이 없으므로 기본값을 채운다
      events: (parsed.events ?? []).map((e) => ({
        ...NO_RECURRENCE,
        ...e,
        reminders: e.reminders ?? [],
        milestone_id: e.milestone_id ?? null,
      })),
      tasks: (parsed.tasks ?? []).map((t) => ({ ...t, milestone_id: t.milestone_id ?? null })),
      // 예전 카테고리·태그에는 kind가 없다 → 캘린더용
      categories: (parsed.categories ?? []).map((c) => ({ ...c, kind: c.kind ?? "event" })),
      tags: (parsed.tags ?? []).map((t) => ({ ...t, kind: t.kind ?? "event" })),
      goals: (parsed.goals ?? []).map((g) => ({ ...g, start_date: g.start_date ?? null })),
      milestones: parsed.milestones ?? [],
      money_categories: parsed.money_categories ?? [],
      money_entries: parsed.money_entries ?? [],
      money_recurring: parsed.money_recurring ?? [],
      money_budgets: parsed.money_budgets ?? [],
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

/** 마일스톤이 지워지면 연결된 할 일·일정은 연결만 푼다 (DB의 on delete set null과 같게) */
function unlinkMilestones(snap: Snapshot, ids: Set<string>) {
  const unlink = <T extends { milestone_id: string | null }>(x: T): T =>
    x.milestone_id && ids.has(x.milestone_id) ? { ...x, milestone_id: null } : x;
  snap.tasks = snap.tasks.map(unlink);
  snap.events = snap.events.map(unlink);
}

const localRepo: Repo = {
  mode: "local",
  hasMoney: true,
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
    if (table === "goals") {
      // 목표를 지우면 그 마일스톤도 (DB의 on delete cascade와 같게)
      const gone = new Set(snap.milestones.filter((m) => m.goal_id === id).map((m) => m.id));
      snap.goals = snap.goals.filter((g) => g.id !== id);
      snap.milestones = snap.milestones.filter((m) => m.goal_id !== id);
      unlinkMilestones(snap, gone);
    } else if (table === "milestones") {
      snap.milestones = snap.milestones.filter((m) => m.id !== id);
      unlinkMilestones(snap, new Set([id]));
    } else if (table === "money_categories") {
      // 분류를 지우면 내역·고정 항목은 "분류 없음" (DB의 on delete set null과 같게)
      snap.money_categories = snap.money_categories.filter((c) => c.id !== id);
      const clear = <T extends { category_id: string | null }>(x: T): T =>
        x.category_id === id ? { ...x, category_id: null } : x;
      snap.money_entries = snap.money_entries.map(clear);
      snap.money_recurring = snap.money_recurring.map(clear);
    } else if (table === "money_recurring") {
      // 고정 항목을 지우면 이미 만든 내역은 남고 연결만 풀린다
      snap.money_recurring = snap.money_recurring.filter((r) => r.id !== id);
      snap.money_entries = snap.money_entries.map((e) =>
        e.recurring_id === id ? { ...e, recurring_id: null } : e,
      );
    } else {
      // 반복 일정을 지우면 떼어 낸 회차도 함께 (DB의 on delete cascade와 같게)
      (snap[table] as { id: string; series_id?: string | null }[]) = (
        snap[table] as { id: string; series_id?: string | null }[]
      ).filter((r) => r.id !== id && r.series_id !== id);
    }
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
    reminders: (r.reminders as number[] | null) ?? [],
    milestone_id: (r.milestone_id as string | null) ?? null,
  };
}

/** 003_recurrence.sql 실행 전 DB에는 반복 칸이 없으므로, 저장할 때 그 칸을 뺀다 */
function withoutRecurrence<T extends Partial<CalendarEvent>>(e: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rrule, exdates, series_id, original_date, ...rest } = e;
  return rest;
}

/** 005_notifications.sql 실행 전 DB에는 알림 칸이 없으므로, 저장할 때 그 칸을 뺀다 */
function withoutReminders<T extends Partial<CalendarEvent>>(e: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reminders, ...rest } = e;
  return rest;
}

/** 006_roadmap.sql 실행 전 DB에는 마일스톤 연결 칸이 없으므로, 저장할 때 그 칸을 뺀다 */
function withoutMilestone<T extends { milestone_id?: string | null }>(row: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { milestone_id, ...rest } = row;
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
    milestone_id: (r.milestone_id as string | null) ?? null,
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

function toGoal(r: Record<string, unknown>): Goal {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    color: isColorKey(r.color) ? r.color : "blue",
    start_date: (r.start_date as string | null) ?? null,
    target_date: (r.target_date as string | null) ?? null,
    memo: String(r.memo ?? ""),
    archived: Boolean(r.archived),
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

function toMilestone(r: Record<string, unknown>): Milestone {
  return {
    id: String(r.id),
    goal_id: String(r.goal_id),
    title: String(r.title ?? ""),
    target_date: (r.target_date as string | null) ?? null,
    done: Boolean(r.done),
    sort_order: Number(r.sort_order ?? 0),
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

const toMoneyType = (v: unknown): MoneyType => (v === "income" ? "income" : "expense");

function toMoneyCategory(r: Record<string, unknown>): MoneyCategory {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    color: isColorKey(r.color) ? r.color : "gray",
    type: toMoneyType(r.type),
    sort_order: Number(r.sort_order ?? 0),
  };
}

function toMoneyEntry(r: Record<string, unknown>): MoneyEntry {
  return {
    id: String(r.id),
    date: String(r.date),
    type: toMoneyType(r.type),
    amount: Number(r.amount ?? 0),
    category_id: (r.category_id as string | null) ?? null,
    title: String(r.title ?? ""),
    recurring_id: (r.recurring_id as string | null) ?? null,
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

function toMoneyRecurring(r: Record<string, unknown>): MoneyRecurring {
  return {
    id: String(r.id),
    type: toMoneyType(r.type),
    amount: Number(r.amount ?? 0),
    category_id: (r.category_id as string | null) ?? null,
    title: String(r.title ?? ""),
    day: Number(r.day ?? 1),
    start_month: String(r.start_month),
    end_month: (r.end_month as string | null) ?? null,
    skipped: (r.skipped as string[] | null) ?? [],
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

function toMoneyBudget(r: Record<string, unknown>): MoneyBudget {
  return {
    id: String(r.id),
    month: String(r.month),
    amount: r.amount == null ? null : Number(r.amount),
    created_at: String(r.created_at ?? new Date().toISOString()),
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
  let hasReminders = true;
  let hasRoadmap = true;
  let hasGoalStart = true;
  let hasMoney = true;
  const prepare = <T extends TableName>(table: T, row: TableRow[T]): TableRow[T] => {
    if (table === "events") {
      let e: Partial<CalendarEvent> = row as CalendarEvent;
      if (!hasRecurrence) e = withoutRecurrence(e);
      if (!hasReminders) e = withoutReminders(e);
      if (!hasRoadmap) e = withoutMilestone(e);
      return e as unknown as TableRow[T];
    }
    if (table === "tasks" && !hasRoadmap)
      return withoutMilestone(row as Task) as unknown as TableRow[T];
    if (table === "goals" && !hasGoalStart) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { start_date, ...rest } = row as Goal;
      return rest as unknown as TableRow[T];
    }
    if ((table === "categories" || table === "tags") && !hasKind)
      return withoutKind(row as Category | Tag) as unknown as TableRow[T];
    return row;
  };
  return {
    mode: "cloud",
    get hasMoney() {
      return hasMoney;
    },
    async load() {
      const [ev, task, cat, tag, goal, ms, rec, kind, rem, gstart, mcat, ment, mrec, mbud] = await Promise.all([
        db.from("events").select("*"),
        db.from("tasks").select("*"),
        db.from("categories").select("*").order("sort_order"),
        db.from("tags").select("*").order("name"),
        db.from("goals").select("*").order("sort_order"),
        db.from("milestones").select("*").order("sort_order"),
        db.from("events").select("rrule").limit(1),
        db.from("categories").select("kind").limit(1),
        db.from("events").select("reminders").limit(1),
        db.from("goals").select("start_date").limit(1),
        db.from("money_categories").select("*").order("sort_order"),
        db.from("money_entries").select("*"),
        db.from("money_recurring").select("*"),
        db.from("money_budgets").select("*").order("month"),
      ]);
      check(ev.error);
      check(cat.error);
      check(tag.error);
      // tasks 테이블이 아직 없으면(2단계 마이그레이션 전) 할 일만 비우고 계속 진행
      if (task.error?.code === "PGRST205") {
        throw new MissingTableError(
          "할 일 테이블이 없어요. Supabase SQL Editor에서 supabase/migrations/002_tasks.sql을 실행해 주세요.",
          {
            ...structuredClone(EMPTY),
            events: (ev.data ?? []).map(toEvent),
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
        // 로드맵 테이블이 없으면(006 실행 전) 빈 로드맵
        goals: goal.error ? [] : (goal.data ?? []).map(toGoal),
        milestones: ms.error ? [] : (ms.data ?? []).map(toMilestone),
        // 가계부 테이블이 없으면(008 실행 전) 빈 가계부
        money_categories: mcat.error ? [] : (mcat.data ?? []).map(toMoneyCategory),
        money_entries: ment.error ? [] : (ment.data ?? []).map(toMoneyEntry),
        money_recurring: mrec.error ? [] : (mrec.data ?? []).map(toMoneyRecurring),
        money_budgets: mbud.error ? [] : (mbud.data ?? []).map(toMoneyBudget),
      };
      // 나중에 추가한 칸이 없으면(마이그레이션 전) 그 기능 없이 계속 쓰고 안내만 한다
      hasRecurrence = !rec.error;
      hasKind = !kind.error;
      hasReminders = !rem.error;
      hasRoadmap = !goal.error && !ms.error;
      hasGoalStart = hasRoadmap && !gstart.error;
      hasMoney = !mcat.error && !ment.error && !mrec.error && !mbud.error;
      const missing = [
        rec.error && "003_recurrence.sql(반복 일정)",
        kind.error && "004_split_categories.sql(캘린더·할 일 카테고리 분리)",
        rem.error && "005_notifications.sql(알림)",
        !hasRoadmap && "006_roadmap.sql(로드맵)",
        !hasGoalStart && "007_goal_start.sql(목표 시작일)",
        !hasMoney && "008_money.sql(가계부)",
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
      // 로드맵은 채널을 따로: 006 실행 전이라 테이블이 없어도 위 채널은 영향 받지 않게
      const roadmap = db
        .channel("daypath-sync-roadmap")
        .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "milestones" }, debounced)
        .subscribe();
      // 가계부도 채널을 따로 (008 실행 전이어도 다른 채널은 영향 없게)
      const money = db
        .channel("daypath-sync-money")
        .on("postgres_changes", { event: "*", schema: "public", table: "money_categories" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "money_entries" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "money_recurring" }, debounced)
        .on("postgres_changes", { event: "*", schema: "public", table: "money_budgets" }, debounced)
        .subscribe();
      return () => {
        clearTimeout(timer);
        db.removeChannel(channel);
        db.removeChannel(roadmap);
        db.removeChannel(money);
      };
    },
  };
}

export const repo: Repo = supabase ? cloudRepo() : localRepo;
