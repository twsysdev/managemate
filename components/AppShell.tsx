"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ManageMateApp from "@/components/ManageMateApp";

// ManageMateApp を包み、サインアウト処理を注入する。
export default function AppShell({ userEmail }: { userEmail?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <ManageMateApp onSignOut={handleSignOut} userEmail={userEmail} />;
}
