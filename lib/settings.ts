import { createClient } from "@/lib/supabase/client";
import type { Masters, NotifySettings } from "@/lib/types";

// 新規ユーザーの分類マスタ（①: ラベルは空。ユーザーが自分で作る）
export const EMPTY_MASTERS: Masters = {
  A: { name: "", items: [] },
  B: { name: "", items: [] },
  C: { name: "", items: [] },
};

// 通知設定の既定値
export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  defaultLead: 10,
  taskLead: 1440,
  overdue: true,
  quietStart: "22:00",
  quietEnd: "07:00",
  quietEnabled: true,
};

// ── 分類マスタ（JSONBで {A,B,C} をそのまま保持）──
export async function fetchMasters(): Promise<Masters | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("masters")
    .select("data")
    .maybeSingle();
  if (error) throw error;
  return data ? (data.data as Masters) : null;
}

export async function saveMasters(userId: string, masters: Masters): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("masters")
    .upsert(
      { user_id: userId, data: masters, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

// ── 通知設定（スネークケース列 ↔ アプリのキャメルケース）──
interface DbNotify {
  user_id: string;
  enabled: boolean;
  default_lead: number;
  task_lead: number;
  overdue: boolean;
  quiet_start: string;
  quiet_end: string;
  quiet_enabled: boolean;
}

function dbToNotify(r: DbNotify): NotifySettings {
  return {
    enabled: r.enabled,
    defaultLead: r.default_lead,
    taskLead: r.task_lead,
    overdue: r.overdue,
    quietStart: r.quiet_start,
    quietEnd: r.quiet_end,
    quietEnabled: r.quiet_enabled,
  };
}

export async function fetchNotifySettings(): Promise<NotifySettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notify_settings")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? dbToNotify(data as DbNotify) : null;
}

export async function saveNotifySettings(
  userId: string,
  s: NotifySettings
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notify_settings").upsert(
    {
      user_id: userId,
      enabled: s.enabled,
      default_lead: s.defaultLead,
      task_lead: s.taskLead,
      overdue: s.overdue,
      quiet_start: s.quietStart,
      quiet_end: s.quietEnd,
      quiet_enabled: s.quietEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
