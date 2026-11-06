"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/data/supabase";

/**
 * 클라우드 모드에서는 로그인해야 앱을 볼 수 있다.
 * 로컬 모드(Supabase 미설정)에서는 그대로 통과.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(
    supabase ? undefined : null,
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <>{children}</>;
  if (session === undefined) return <FullScreenMessage>불러오는 중…</FullScreenMessage>;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-fg-muted">
      {children}
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { error, data } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup" && !data.session)
      setMessage("확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Daypath</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {mode === "signin" ? "로그인" : "계정 만들기"}
          </p>
        </div>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-fg-muted"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-fg-muted"
        />
        {message && <p className="text-sm text-fg-muted">{message}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {mode === "signin" ? "로그인" : "가입하기"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-sm text-fg-muted hover:text-fg"
        >
          {mode === "signin" ? "처음이신가요? 계정 만들기" : "이미 계정이 있어요"}
        </button>
      </form>
    </div>
  );
}
