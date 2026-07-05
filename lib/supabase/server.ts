import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/config";

// サーバー（サーバーコンポーネント / Route Handler）用の Supabase クライアント。
// Next.js 15 では cookies() が非同期。
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component からの set は無視（middleware がセッションを更新する）
        }
      },
    },
  });
}
