// ─────────────────────────────────────────────────────────────
// サーバー側 Web Push 送信（Next.js API Route 用）。
// 実際の定期配信は Supabase Edge Function が担うが、テスト送信や
// 単発配信のためにここでも web-push で送れるようにしておく。
// ※ Node.js ランタイム前提（Edge ランタイム不可）。
// ─────────────────────────────────────────────────────────────
import webpush from "web-push";

let configured = false;

export function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  return { publicKey, privateKey, subject };
}

// web-push に VAPID を一度だけ設定する。未設定なら false。
export function ensureVapid(): boolean {
  if (configured) return true;
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  itemId?: string;
  requireInteraction?: boolean;
}

export interface WebPushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// 1件の購読へ送る。dead（404/410）なら { gone: true } を返す。
export async function sendToSubscription(
  sub: WebPushSub,
  payload: PushPayload
): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 });
    return { ok: true, gone: false };
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode;
    const gone = statusCode === 404 || statusCode === 410;
    return { ok: false, gone, error: (e as Error)?.message ?? "send failed" };
  }
}

export { webpush };
