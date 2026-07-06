import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, emailFromIdToken } from "@/lib/google";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("g_oauth_state")?.value;

  const home = new URL("/", origin);
  home.searchParams.set("screen", "extcal");

  if (url.searchParams.get("error")) {
    home.searchParams.set("gcal", "error");
    return NextResponse.redirect(home);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    home.searchParams.set("gcal", "error");
    return NextResponse.redirect(home);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  try {
    const redirectUri = `${origin}/api/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    const email = emailFromIdToken(tokens.id_token);

    const row: Record<string, unknown> = {
      user_id: user.id,
      email,
      updated_at: new Date().toISOString(),
    };
    // refresh_token は初回同意時のみ返る。無ければ既存を維持。
    if (tokens.refresh_token) row.refresh_token = tokens.refresh_token;

    if (tokens.refresh_token) {
      await supabase.from("google_accounts").upsert(row, { onConflict: "user_id" });
    } else {
      await supabase.from("google_accounts").update(row).eq("user_id", user.id);
    }
    home.searchParams.set("gcal", "connected");
  } catch {
    home.searchParams.set("gcal", "error");
  }
  const res = NextResponse.redirect(home);
  res.cookies.delete("g_oauth_state");
  return res;
}
