import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 購読解除。RLS により自分の行だけ削除できる。
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint);
  if (error) {
    console.error("unsubscribe delete failed", error);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
