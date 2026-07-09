// ─────────────────────────────────────────────────────────────
// 保守用ヘルパ: cron 実行ログの手動削除と、最終実行日の取得。
//   ・prune_cron_logs は security definer の RPC（DB側）を呼ぶ。
//   ・最終実行日は maintenance_state テーブルから読む。
// ─────────────────────────────────────────────────────────────
import { createClient } from "@/lib/supabase/client";

export interface MaintenanceState {
  last_run_at: string | null;
  last_deleted: number | null;
}

// 最終実行日・削除件数を取得（未実行なら null）
export async function fetchMaintenanceState(
  action = "prune_cron_logs"
): Promise<MaintenanceState | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("maintenance_state")
    .select("last_run_at,last_deleted")
    .eq("action", action)
    .maybeSingle();
  if (error) throw error;
  return (data as MaintenanceState | null) ?? null;
}

// cron 実行ログを削除（retain_days 日より古いもの）。削除件数と実行時刻を返す。
export async function pruneCronLogs(
  retainDays = 3
): Promise<{ deleted: number; last_run_at: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("prune_cron_logs", {
    retain_days: retainDays,
  });
  if (error) throw error;
  return data as { deleted: number; last_run_at: string };
}
