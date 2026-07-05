import { createClient } from "@/lib/supabase/client";
import type { Item, Kind } from "@/lib/types";

// Supabase items テーブルの行
interface DbItem {
  id: string;
  user_id: string;
  kind: Kind;
  title: string;
  a: string;
  b: string;
  c: string;
  detail1: string;
  detail2: string;
  start_at: string;
  end_at: string;
  files: string[];
  done: boolean;
  notify: number | null;
  created_at: string;
  updated_at: string;
}

// DB行 → アプリの Item（A/B/C・start/end へ名前を戻す）
export function dbToItem(r: DbItem): Item {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title ?? "",
    A: r.a ?? "",
    B: r.b ?? "",
    C: r.c ?? "",
    detail1: r.detail1 ?? "",
    detail2: r.detail2 ?? "",
    start: r.start_at ?? "",
    end: r.end_at ?? "",
    files: r.files ?? [],
    done: !!r.done,
    notify: r.notify ?? null,
    _seq: r.created_at ? Date.parse(r.created_at) : 0,
  };
}

// アプリの Item（部分） → DBカラム（渡されたフィールドのみ）
function toDbColumns(data: Partial<Item>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (data.kind !== undefined) out.kind = data.kind;
  if (data.title !== undefined) out.title = data.title;
  if (data.A !== undefined) out.a = data.A;
  if (data.B !== undefined) out.b = data.B;
  if (data.C !== undefined) out.c = data.C;
  if (data.detail1 !== undefined) out.detail1 = data.detail1;
  if (data.detail2 !== undefined) out.detail2 = data.detail2;
  if (data.start !== undefined) out.start_at = data.start;
  if (data.end !== undefined) out.end_at = data.end;
  if (data.files !== undefined) out.files = data.files;
  if (data.done !== undefined) out.done = data.done;
  if (data.notify !== undefined) out.notify = data.notify;
  return out;
}

// insert 用に必須フィールドを補完
function withInsertDefaults(d: Partial<Item>): Partial<Item> {
  return {
    kind: (d.kind ?? "task") as Kind,
    title: d.title ?? "",
    A: d.A ?? "",
    B: d.B ?? "",
    C: d.C ?? "",
    detail1: d.detail1 ?? "",
    detail2: d.detail2 ?? "",
    start: d.start ?? "",
    end: d.end ?? "",
    files: d.files ?? [],
    done: d.done ?? false,
    notify: d.notify ?? null,
  };
}

// 全件取得（新しい順）。user_id は RLS により本人の行のみ返る。
export async function fetchItems(): Promise<Item[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbItem[]).map(dbToItem);
}

// 1件追加（user_id はDB側 default auth.uid() で補完）
export async function insertItem(data: Partial<Item>): Promise<Item> {
  const supabase = createClient();
  const { data: inserted, error } = await supabase
    .from("items")
    .insert(toDbColumns(withInsertDefaults(data)))
    .select()
    .single();
  if (error) throw error;
  return dbToItem(inserted as DbItem);
}

// 複数追加（AIの一括登録・繰り返し登録）
export async function insertItems(list: Partial<Item>[]): Promise<Item[]> {
  const supabase = createClient();
  const rows = list.map((d) => toDbColumns(withInsertDefaults(d)));
  const { data, error } = await supabase.from("items").insert(rows).select();
  if (error) throw error;
  return (data as DbItem[]).map(dbToItem);
}

// 変更（渡されたフィールドのみ）
export async function updateItemDb(
  id: Item["id"],
  changes: Partial<Item>
): Promise<void> {
  const supabase = createClient();
  const patch = { ...toDbColumns(changes), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("items").update(patch).eq("id", id);
  if (error) throw error;
}

// 削除（複数id）
export async function deleteItemsDb(ids: Item["id"][]): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("items").delete().in("id", ids);
  if (error) throw error;
}
