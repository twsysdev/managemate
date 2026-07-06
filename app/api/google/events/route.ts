import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken, loadGoogleCalendars } from "@/lib/google";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false }, { status: 401 });

  const { data: acct } = await supabase
    .from("google_accounts")
    .select("email, refresh_token")
    .maybeSingle();
  if (!acct) return NextResponse.json({ connected: false, calendars: [] });

  try {
    const tokens = await refreshAccessToken(acct.refresh_token);
    const now = new Date();
    const timeMin = new Date(now.getTime() - 31 * 86400000).toISOString();
    const timeMax = new Date(now.getTime() + 120 * 86400000).toISOString();
    const calendars = await loadGoogleCalendars(tokens.access_token, timeMin, timeMax);

    const { data: prefs } = await supabase
      .from("google_calendar_prefs")
      .select("calendar_id, visible, color");
    const prefMap = new Map((prefs || []).map((p) => [p.calendar_id, p]));
    const merged = calendars.map((c) => {
      const p = prefMap.get(c.id);
      if (!p) return c;
      return { ...c, enabled: p.visible == null ? c.enabled : p.visible, color: p.color || c.color };
    });

    return NextResponse.json({ connected: true, email: acct.email, calendars: merged });
  } catch {
    // トークン失効等。連携解除扱いで返す（行は残すが要再連携）
    return NextResponse.json({ connected: false, calendars: [], error: "reauth_required" });
  }
}
