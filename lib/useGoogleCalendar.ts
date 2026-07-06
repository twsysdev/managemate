"use client";

import { useCallback, useEffect, useState } from "react";

interface ExtCalendar {
  id: string;
  name: string;
  color: string;
  source: string;
  enabled: boolean;
  events: { id: string; title: string; start: string; end: string; meet: string }[];
}

// Google カレンダー連携の状態と予定を扱うフック。
export function useGoogleCalendar() {
  const [calendars, setCalendars] = useState<ExtCalendar[]>([]);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetch("/api/google/status").then((r) => r.json());
      setConnected(!!s.connected);
      setEmail(s.email || "");
      if (s.connected) {
        const e = await fetch("/api/google/events").then((r) => r.json());
        if (e.connected) {
          setCalendars(e.calendars || []);
          setEmail(e.email || s.email || "");
        } else {
          setConnected(false);
          setCalendars([]);
        }
      } else {
        setCalendars([]);
      }
    } catch {
      setConnected(false);
      setCalendars([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const connect = useCallback(() => {
    window.location.href = "/api/google/connect";
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/google/disconnect", { method: "POST" });
    await reload();
  }, [reload]);

  const savePref = useCallback(
    async (calendarId: string, patch: { visible?: boolean; color?: string }) => {
      setCalendars((prev) =>
        prev.map((c) =>
          c.id === calendarId
            ? { ...c, ...(patch.visible !== undefined ? { enabled: patch.visible } : {}), ...(patch.color !== undefined ? { color: patch.color } : {}) }
            : c
        )
      );
      try {
        await fetch("/api/google/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarId, ...patch }) });
      } catch {}
    },
    []
  );

  return { calendars, connected, email, loading, connect, disconnect, reload, savePref };
}
