"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { refreshPush } from "../push";
import { buildQueue } from "../reminders";
import { DEFAULT_NOTIFY, type NotifySettings } from "../types";
import { useStore } from "./store";
import { supabase } from "./supabase";

/**
 * 알림 설정과 예약 동기화.
 * - 설정(user_settings)은 모든 기기 공통
 * - 일정·할 일·설정이 바뀌거나 앱을 열면, 앞으로 30일치 알림을 계산해 서버(push_queue)에 통째로 넘긴다
 * - 알림은 클라우드 모드 + 005_notifications.sql 실행 후에만 쓸 수 있다
 */

type Notify = {
  settings: NotifySettings;
  /** 알림을 쓸 수 있는지 (클라우드 모드 + DB 준비됨) */
  available: boolean;
  saveSettings(patch: Partial<NotifySettings>): Promise<void>;
};

const NotifyContext = createContext<Notify | null>(null);

/** 열어 둔 채로 날이 바뀌어도 30일 범위가 따라가도록 다시 계산하는 간격 */
const RESYNC_MS = 60 * 60 * 1000;

function toSettings(r: Record<string, unknown> | null): NotifySettings {
  if (!r) return DEFAULT_NOTIFY;
  return {
    event_reminders: (r.event_reminders as number[] | null) ?? DEFAULT_NOTIFY.event_reminders,
    allday_time: String(r.allday_time ?? DEFAULT_NOTIFY.allday_time),
    task_digest: r.task_digest !== false,
    task_time: String(r.task_time ?? DEFAULT_NOTIFY.task_time),
  };
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { events, tasks, ready, mode } = useStore();
  const [settings, setSettings] = useState<NotifySettings>(DEFAULT_NOTIFY);
  const [available, setAvailable] = useState(false);
  const [tick, setTick] = useState(0);
  const lastSent = useRef<string | null>(null);

  // 설정 불러오기 (테이블이 없으면 알림 기능을 끈 채로)
  useEffect(() => {
    if (mode !== "cloud" || !supabase) return;
    const db = supabase;
    let cancelled = false;
    void (async () => {
      const { data, error } = await db.from("user_settings").select("*").maybeSingle();
      if (cancelled || error) return; // error: 005 실행 전
      setSettings(toSettings(data));
      setAvailable(true);
      void refreshPush().catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // 한 시간마다 다시 계산
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), RESYNC_MS);
    return () => clearInterval(id);
  }, []);

  // 예약 동기화 (바뀐 뒤 2초 기다렸다가, 내용이 같으면 보내지 않음)
  useEffect(() => {
    if (!available || !ready || !supabase) return;
    const db = supabase;
    const timer = setTimeout(() => {
      const items = buildQueue(events, tasks, settings);
      const key = JSON.stringify(items);
      if (key === lastSent.current) return;
      void db.rpc("replace_push_queue", { items }).then(({ error }) => {
        if (error) console.warn("알림 예약 실패", error.message);
        else lastSent.current = key;
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [available, ready, events, tasks, settings, tick]);

  const saveSettings = useCallback(
    async (patch: Partial<NotifySettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;
      const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...next });
      if (error) console.warn("알림 설정 저장 실패", error.message);
    },
    [settings],
  );

  const value = useMemo(
    () => ({ settings, available, saveSettings }),
    [settings, available, saveSettings],
  );
  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}

export function useNotify(): Notify {
  const v = useContext(NotifyContext);
  if (!v) throw new Error("useNotify must be used inside <NotifyProvider>");
  return v;
}
