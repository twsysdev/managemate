"use client";

import { useCallback, useEffect, useState } from "react";

export interface ZoomMeetingInfo {
  id: string;
  join_url: string;
  passcode: string;
}

// Zoom 連携の状態と、会議作成を扱うフック。
export function useZoom() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetch("/api/zoom/status").then((r) => r.json());
      setConnected(!!s.connected);
      setEmail(s.email || "");
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const connect = useCallback(() => {
    window.location.href = "/api/zoom/connect";
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/zoom/disconnect", { method: "POST" });
    await reload();
  }, [reload]);

  // 会議を作成。成功で会議情報、失敗で例外（理由文言つき）を投げる。
  const createMeeting = useCallback(
    async (input: { topic: string; start: string; end: string }): Promise<ZoomMeetingInfo> => {
      const res = await fetch("/api/zoom/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 診断しやすいよう、Zoomからの詳細（あれば）を短く添える。
        const detail = typeof j.detail === "string" && j.detail ? `（詳細: ${j.detail.slice(0, 200)}）` : "";
        if (j.error === "not_connected") throw new Error("Zoomが未接続です。設定から接続してください。");
        if (j.error === "reauth_required") throw new Error(`Zoomの再接続が必要です。設定から接続し直してください。${detail}`);
        throw new Error(`Zoom会議の作成に失敗しました。${detail}`);
      }
      return { id: j.id || "", join_url: j.join_url || "", passcode: j.passcode || "" };
    },
    []
  );

  return { connected, email, loading, connect, disconnect, reload, createMeeting };
}
