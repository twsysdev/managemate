import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken, createMeeting, type CreatedMeeting } from "@/lib/zoom";

export const runtime = "nodejs";

// アクセストークンが「無効/期限切れ」を示すエラーか（Zoomは code 124 / "Invalid access token" 等）。
function isAuthError(msg: string): boolean {
  return /invalid access token|access token is expired|code.?124|\b401\b|unauthorized/i.test(msg);
}

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

  // 現在のトークン状態（リフレッシュのたびに更新する）。
  let accessToken = (acct.access_token as string) || "";
  let refreshToken = acct.refresh_token as string;
  const exp = acct.expires_at ? new Date(acct.expires_at).getTime() : 0;

  // refresh_token でアクセストークンを更新し、ローテーション後のトークンを保存する。
  async function doRefresh() {
    const tokens = await refreshAccessToken(refreshToken);
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    await supabase
      .from("zoom_accounts")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user!.id);
  }

  const input = { topic: body.topic || "会議", start: body.start || "", end: body.end || "" };

  // 1) 期限切れ間近なら先にリフレッシュ
  let refreshed = false;
  try {
    if (!accessToken || exp <= Date.now() + 60_000) {
      await doRefresh();
      refreshed = true;
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: "reauth_required", detail }, { status: 401 });
  }

  // 2) 会議作成。トークンが無効なら一度だけリフレッシュして再試行。
  let meeting: CreatedMeeting;
  try {
    meeting = await createMeeting(accessToken, input);
  } catch (e1) {
    const d1 = e1 instanceof Error ? e1.message : "";
    if (!refreshed && isAuthError(d1)) {
      try {
        await doRefresh();
      } catch (e2) {
        const d2 = e2 instanceof Error ? e2.message : "";
        return NextResponse.json({ error: "reauth_required", detail: d2 || d1 }, { status: 401 });
      }
      try {
        meeting = await createMeeting(accessToken, input);
      } catch (e3) {
        const d3 = e3 instanceof Error ? e3.message : "";
        return NextResponse.json({ error: "create_failed", detail: d3 }, { status: 502 });
      }
    } else {
      // リフレッシュのトークンが失効している等はここに来る
      if (/invalid_grant|invalid.?refresh/i.test(d1)) {
        return NextResponse.json({ error: "reauth_required", detail: d1 }, { status: 401 });
      }
      return NextResponse.json({ error: "create_failed", detail: d1 }, { status: 502 });
    }
  }

  return NextResponse.json({
    id: meeting.id,
    join_url: meeting.join_url,
    passcode: meeting.passcode,
  });
}
