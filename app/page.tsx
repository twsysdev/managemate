import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";

// 認証状態に依存するため常に動的レンダリング。
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <AppShell userEmail={user.email ?? undefined} />;
}
