// Supabase の環境変数（必須）。未設定なら分かりやすいエラーで停止する。
// ManageMate は Supabase 接続を前提とする構成。
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase の環境変数が未設定です。.env.local に NEXT_PUBLIC_SUPABASE_URL と " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください（docs/PHASE2_SUPABASE.md 参照）。"
    );
  }
  return { url, anonKey };
}
