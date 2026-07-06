import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/google";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: acct } = await supabase
    .from("google_accounts")
    .select("refresh_token")
    .maybeSingle();
  if (acct?.refresh_token) await revokeToken(acct.refresh_token);
  await supabase.from("google_accounts").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
