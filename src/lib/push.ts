/**
 * 이 기기의 푸시 알림 구독 (Web Push).
 * 구독 정보는 push_subscriptions 테이블에 저장하고, 서버(pg_cron → /api/push)가 그 기기로 보낸다.
 */
import { supabase } from "./data/supabase";
import { isIOS, isStandalone } from "./pwa";

export type PushState =
  /** iPhone·iPad Safari: 홈 화면에 추가한 앱에서만 가능 */
  | "needs-install"
  /** 브라우저가 지원하지 않음 */
  | "unsupported"
  /** 사용자가 알림을 차단함 */
  | "denied"
  | "off"
  | "on";

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function base64UrlToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function register(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase!.rpc("register_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

/** 권한을 묻고 이 기기를 구독한다 */
export async function enablePush(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("알림 공개 키(NEXT_PUBLIC_VAPID_PUBLIC_KEY)가 설정되지 않았어요.");
  if (!supabase) throw new Error("알림은 클라우드 동기화에서만 쓸 수 있어요.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았어요.");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(key),
    }));
  await register(sub);
}

/** 이 기기 구독 해제 */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** 앱을 열 때: 이미 구독한 기기면 DB에도 있도록 다시 등록 (다른 계정에서 넘어온 경우 등) */
export async function refreshPush(): Promise<void> {
  if (!supabase || !supported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await register(sub);
}

/** 테스트 알림: 1분 안에 이 계정의 모든 기기로 */
export async function sendTestPush(): Promise<void> {
  const { error } = await supabase!.rpc("queue_test_push");
  if (error) throw new Error(error.message);
}
