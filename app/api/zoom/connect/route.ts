import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/zoom";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const origin = new URL(request.url).origin;
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  // 環境変数に固定の redirect を優先（Zoom 側の許可リストと完全一致させるため）。無ければ origin から生成。
  const redirectUri = process.env.ZOOM_REDIRECT_URI || `${origin}/api/zoom/callback`;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(redirectUri, state));
  // CSRF 対策の簡易 state（callback で照合）
  res.cookies.set("z_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 600,
  });
  return res;
}
