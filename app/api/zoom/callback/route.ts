import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, getMe } from "@/lib/zoom";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("z_oauth_state")?.value;

  const home = new URL("/", origin);
  home.searchParams.set("screen", "extcal");

  if (url.searchParams.get("error")) {
    home.searchParams.set("zoom", "error");
    return NextResponse.redirect(home);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    home.searchParams.set("zoom", "error");
    return NextResponse.redirect(home);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  try {
    const redirectUri = process.env.ZOOM_REDIRECT_URI || `${origin}/api/zoom/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    const { email } = await getMe(tokens.access_token);
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    await supabase.from("zoom_accounts").upsert(
      {
        user_id: user.id,
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    home.searchParams.set("zoom", "connected");
  } catch {
    home.searchParams.set("zoom", "error");
  }
  const res = NextResponse.redirect(home);
  res.cookies.delete("z_oauth_state");
  return res;
}
