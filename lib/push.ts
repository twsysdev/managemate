// ─────────────────────────────────────────────────────────────
// Web Push クライアントヘルパ
//   ・Service Worker の登録
//   ・通知許可のリクエスト → PushManager での購読
//   ・購読情報をサーバー（/api/push/subscribe）へ保存
// デスクトップ（Chrome/Edge/Firefox）とスマホ（Android Chrome / iOS16.4+ PWA）
// のどちらも、この同じ経路で購読する。
// ─────────────────────────────────────────────────────────────

export type PushStatus =
  | "unsupported" // この環境は Push 非対応
  | "denied" // ユーザーがブロック済み
  | "default" // まだ許可を求めていない
  | "subscribed" // 購読済み
  | "granted-unsubscribed"; // 許可はあるが購読していない

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Web Push はブラウザ・OS が揃って初めて使える。段階的に判定する。
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// VAPID 公開鍵（Base64URL）を Uint8Array へ変換（applicationServerKey 用）
// 明示的に ArrayBuffer 上に確保し、BufferSource として渡せる型にする。
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Service Worker を登録（未登録なら）。アプリ起動時に一度呼ぶ。
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.error("SW register failed", e);
    return null;
  }
}

// 現在の購読状態を返す（UI 表示用）
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) {
    return Notification.permission === "granted" ? "granted-unsubscribed" : "default";
  }
  const sub = await reg.pushManager.getSubscription();
  if (sub) return "subscribed";
  return Notification.permission === "granted" ? "granted-unsubscribed" : "default";
}

// 許可を求めて購読し、サーバーへ登録する。成功なら true。
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "この環境はプッシュ通知に対応していません。" };
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, error: "VAPID 公開鍵が未設定です（NEXT_PUBLIC_VAPID_PUBLIC_KEY）。" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "通知が許可されませんでした。" };
  }

  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!reg) return { ok: false, error: "Service Worker を登録できませんでした。" };
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: "購読情報の保存に失敗しました。" };
  }
  return { ok: true };
}

// 購読を解除し、サーバーからも削除する。
export async function disablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch {
      /* 続行 */
    }
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }
  return { ok: true };
}

// テスト通知をサーバーから自分宛てに送る。
export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/push/test", { method: "POST" });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error || "テスト送信に失敗しました。" };
  }
  return { ok: true };
}
