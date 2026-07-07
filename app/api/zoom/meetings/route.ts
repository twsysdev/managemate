import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken, createMeeting } from "@/lib/zoom";

export const runtime = "nodejs";

// 予定に紐づく Zoom 会議を作成する。
// body: { topic, start, end }（start/end はアプリ形式 "YYYY-MM-DDTHH:MM" / "YYYY-MM-DD"）
// 返り値: { id, join_url, passcode }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: acct } = await supabase
    .from("zoom_accounts")
    .select("access_token, refresh_token, expires_at")
    .maybeSingle();
  if (!acct) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  let body: { topic?: string; start?: string; end?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    // アクセストークンが有効ならそのまま、失効間近ならリフレッシュ（refresh_token はローテーションするので保存し直す）。
    let accessToken = acct.access_token as string;
    const exp = acct.expires_at ? new Date(acct.expires_at).getTime() : 0;
    if (!accessToken || exp <= Date.now() + 60_000) {
      const tokens = await refreshAccessToken(acct.refresh_token as string);
      accessToken = tokens.access_token;
      await supabase
        .from("zoom_accounts")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    const meeting = await createMeeting(accessToken, {
      topic: body.topic || "会議",
      start: body.start || "",
      end: body.end || "",
    });
    return NextResponse.json({
      id: meeting.id,
      join_url: meeting.join_url,
      passcode: meeting.passcode,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "";
    // トークン失効時は再連携を促す
    if (/refresh|invalid_grant|token/i.test(detail)) {
      return NextResponse.json({ error: "reauth_required", detail }, { status: 401 });
    }
    return NextResponse.json({ error: "create_failed", detail }, { status: 502 });
  }
}
