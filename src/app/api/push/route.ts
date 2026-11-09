import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

/**
 * 알림 발송 (Supabase pg_cron → pg_net 이 1분마다 호출).
 * DB가 고른 알림 하나와 그 계정의 기기 구독들을 받아 VAPID 키로 서명해 보낸다.
 * 공유 비밀(PUSH_SECRET)이 맞을 때만 동작한다. DB는 읽지 않는다.
 * (Node 런타임이 기본. Cache Components에서는 runtime 설정을 쓸 수 없다)
 */

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
type Payload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  subscriptions: Subscription[];
};

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_SECRET;
  if (!sameSecret(request.headers.get("x-push-secret"), secret)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return Response.json({ error: "VAPID keys are not set" }, { status: 500 });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || new URL(request.url).origin,
    publicKey,
    privateKey,
  );

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const subs = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/",
    tag: payload.tag,
  });

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, message, { TTL: 60 * 60, urgency: "high" });
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: 기기에서 구독이 끝남(앱 삭제, 권한 해제 등) → DB에서 지운다
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        else console.error("push failed", status, (err as Error).message);
      }
    }),
  );

  if (gone.length) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const db = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await db.rpc("remove_push_subscriptions", {
        p_secret: secret,
        p_endpoints: gone,
      });
      if (error) console.error("remove subscriptions failed", error.message);
    }
  }

  return Response.json({ sent, gone: gone.length });
}
