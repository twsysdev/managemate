import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false }, { status: 401 });

  const { data } = await supabase
    .from("google_accounts")
    .select("email")
    .maybeSingle();
  return NextResponse.json({ connected: !!data, email: data?.email ?? "" });
}
