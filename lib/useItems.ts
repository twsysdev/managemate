"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item } from "@/lib/types";
import {
  fetchItems,
  insertItem,
  insertItems,
  updateItemDb,
  deleteItemsDb,
} from "@/lib/items";

// items を Supabase と同期する React フック。
// 表示は即時反映（楽観更新）し、裏で永続化。失敗時はサーバー状態に再同期する。
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchItems();
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(
    async (id: Item["id"]) => {
      let next = false;
      setItems((prev) =>
        prev.map((i) => {
          if (i.id === id) {
            next = !i.done;
            return { ...i, done: next };
          }
          return i;
        })
      );
      try {
        await updateItemDb(id, { done: next });
      } catch (e) {
        console.error("toggle failed", e);
        reload();
      }
    },
    [reload]
  );

  // Capture 画面からの1件追加。DBのidが必要なので確定まで待ってから反映。
  const addItem = useCallback(async (data: Partial<Item>) => {
    try {
      const created = await insertItem(data);
      setItems((prev) => [created, ...prev]);
    } catch (e) {
      console.error("addItem failed", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // AIチャットからの一括追加。
  const addItems = useCallback(async (list: Partial<Item>[]) => {
    try {
      const created = await insertItems(list);
      setItems((prev) => [...created, ...prev]);
    } catch (e) {
      console.error("addItems failed", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // 詳細パネルの保存（draft 全体で置き換え）。
  const saveItem = useCallback(
    async (draft: Item) => {
      setItems((prev) => prev.map((i) => (i.id === draft.id ? { ...draft } : i)));
      try {
        await updateItemDb(draft.id, draft);
      } catch (e) {
        console.error("saveItem failed", e);
        reload();
      }
    },
    [reload]
  );

  // AIチャットからの更新（部分）。
  const updateItem = useCallback(
    async (id: Item["id"], changes: Partial<Item>) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
      try {
        await updateItemDb(id, changes);
      } catch (e) {
        console.error("updateItem failed", e);
        reload();
      }
    },
    [reload]
  );

  const deleteItem = useCallback(
    async (id: Item["id"]) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await deleteItemsDb([id]);
      } catch (e) {
        console.error("deleteItem failed", e);
        reload();
      }
    },
    [reload]
  );

  const deleteItems = useCallback(
    async (ids: Item["id"][]) => {
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      try {
        await deleteItemsDb(ids);
      } catch (e) {
        console.error("deleteItems failed", e);
        reload();
      }
    },
    [reload]
  );

  return {
    items,
    loading,
    error,
    reload,
    toggle,
    addItem,
    addItems,
    saveItem,
    updateItem,
    deleteItem,
    deleteItems,
  };
}
