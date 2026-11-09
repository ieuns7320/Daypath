/**
 * PWA 설치 상태.
 * 브라우저가 보내는 beforeinstallprompt 이벤트를 앱이 뜰 때 붙잡아 두었다가
 * 설정 화면의 [앱 설치] 버튼에서 쓴다. useSyncExternalStore로 구독한다.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  /** 설치된 앱(홈 화면·작업 표시줄)으로 열려 있음 */
  | "installed"
  /** [앱 설치] 버튼으로 바로 설치 가능 (Chrome·Edge 등) */
  | "prompt"
  /** iPhone·iPad: 공유 → 홈 화면에 추가 */
  | "ios"
  /** 그 밖: 브라우저 메뉴에서 설치 */
  | "manual";

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 앱이 뜰 때 한 번 호출 (서비스 워커 등록과 함께) */
export function listenInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault(); // 브라우저 자체 안내 대신 설정 화면 버튼으로
    deferred = e as InstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    justInstalled = true;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS Safari는 "Macintosh"로 나타나므로 터치 지원으로 구분
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function getInstallState(): InstallState {
  if (justInstalled || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}

/** 브라우저 설치 창 띄우기 */
export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const e = deferred;
  deferred = null;
  await e.prompt();
  await e.userChoice;
  emit();
}
