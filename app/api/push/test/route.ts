import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureVapid, sendToSubscription } from "@/lib/push-server";

// web-push は Node API を使うため Node ランタイムを明示。
export const runtime = "nodejs";

// ログインユーザー自身の全端末へテスト通知を送る。
export async function POST() {
  if (!ensureVapid()) {
    return NextResponse.json(
      { error: "VAPID 鍵が未設定です（VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY）。" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) return NextResponse.json({ error: "db error" }, { status: 500 });
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: "この端末はまだ通知を許可していません。" }, { status: 400 });
  }

  let sent = 0;
  const goneEndpoints: string[] = [];
  for (const s of subs) {
    const r = await sendToSubscription(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      {
        title: "ManageMate 🔔",
        body: "テスト通知です。通知は正しく届いています。",
        tag: "mm-test",
        url: "/",
      }
    );
    if (r.ok) sent++;
    if (r.gone) goneEndpoints.push(s.endpoint);
  }

  // 失効した購読は掃除
  if (goneEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", goneEndpoints);
  }

  return NextResponse.json({ ok: true, sent });
}
