import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/config";

// ブラウザ（クライアントコンポーネント）用の Supabase クライアント。
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
