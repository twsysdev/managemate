"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Masters, NotifySettings, DisplayPrefs } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  EMPTY_MASTERS,
  DEFAULT_NOTIFY,
  DEFAULT_DISPLAY_PREFS,
  fetchMasters,
  saveMasters,
  fetchNotifySettings,
  saveNotifySettings,
  fetchDisplayPrefs,
  saveDisplayPrefs,
} from "@/lib/settings";

type Updater<T> = T | ((prev: T) => T);

// 分類マスタ・通知設定を Supabase と同期するフック。
// 編集が多い（ラベル名の入力など）ため、保存はデバウンスして書き込みを間引く。
export function useSettings() {
  const [masters, setMastersState] = useState<Masters>(EMPTY_MASTERS);
  const [notifySettings, setNotifyState] = useState<NotifySettings>(DEFAULT_NOTIFY);
  const [displayPrefs, setDisplayState] = useState<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);
  const [prefsReady, setPrefsReady] = useState(false); // 初期表示設定のロード完了フラグ
  const [loading, setLoading] = useState(true);

  const userIdRef = useRef<string | null>(null);
  const mastersTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初回ロード
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        userIdRef.current = userData.user?.id ?? null;

        const [m, n, d] = await Promise.all([
          fetchMasters(),
          fetchNotifySettings(),
          fetchDisplayPrefs(),
        ]);
        if (!alive) return;
        if (m) setMastersState(m); // 無ければ EMPTY_MASTERS のまま（新規は空）
        if (n) {
          setNotifyState(n);
        } else if (userIdRef.current) {
          // 既定の通知設定を1行作成
          saveNotifySettings(userIdRef.current, DEFAULT_NOTIFY).catch(console.error);
        }
        if (d) setDisplayState(d); // 無ければ DEFAULT_DISPLAY_PREFS のまま
      } catch (e) {
        console.error("settings load failed", e);
      } finally {
        if (alive) {
          setPrefsReady(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setMasters = useCallback((update: Updater<Masters>) => {
    setMastersState((prev) => {
      const next = typeof update === "function" ? (update as (p: Masters) => Masters)(prev) : update;
      if (mastersTimer.current) clearTimeout(mastersTimer.current);
      mastersTimer.current = setTimeout(() => {
        if (userIdRef.current) saveMasters(userIdRef.current, next).catch(console.error);
      }, 600);
      return next;
    });
  }, []);

  const setNotifySettings = useCallback((update: Updater<NotifySettings>) => {
    setNotifyState((prev) => {
      const next = typeof update === "function" ? (update as (p: NotifySettings) => NotifySettings)(prev) : update;
      if (notifyTimer.current) clearTimeout(notifyTimer.current);
      notifyTimer.current = setTimeout(() => {
        if (userIdRef.current) saveNotifySettings(userIdRef.current, next).catch(console.error);
      }, 500);
      return next;
    });
  }, []);

  // 初期表示設定は「保存」ボタンで明示的に永続化する（デバウンスなし・即時書き込み）。
  const saveDisplay = useCallback(async (next: DisplayPrefs) => {
    setDisplayState(next);
    if (userIdRef.current) await saveDisplayPrefs(userIdRef.current, next);
  }, []);

  return {
    masters,
    setMasters,
    notifySettings,
    setNotifySettings,
    displayPrefs,
    saveDisplayPrefs: saveDisplay,
    prefsReady,
    loading,
  };
}
