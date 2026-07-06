import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 連携カレンダーごとの表示設定（デフォルト表示・表示色）を保存する。
// body: { calendarId: string, visible?: boolean, color?: string }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { calendarId?: string; visible?: boolean; color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const { calendarId, visible, color } = body;
  if (!calendarId) return NextResponse.json({ ok: false, error: "calendarId_required" }, { status: 400 });

  const row: Record<string, unknown> = {
    user_id: user.id,
    calendar_id: calendarId,
    updated_at: new Date().toISOString(),
  };
  if (visible !== undefined) row.visible = visible;
  if (color !== undefined) row.color = color;

  const { error } = await supabase
    .from("google_calendar_prefs")
    .upsert(row, { onConflict: "user_id,calendar_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
