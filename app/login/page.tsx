"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ネイビー×ゴールド（アプリ本体と同系）
const C = {
  ink: "#F4F6FA", inkSoft: "#FFFFFF", inkSofter: "#E4E9F0",
  navy: "#1B2A4A", navyDeep: "#16233E", gold: "#C9A24B",
  paper: "#1B2A4A", dim: "#5B6B80", dimmer: "#97A2B3",
  dawn: "#C0492E", mist: "#3C7A5A",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 既にログイン済みならトップへ
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/");
        router.refresh();
      }
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError("メールアドレスとパスワードを入力してください。");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // 確認メールのリンクを、開いている本番URLに戻す
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        if (data.session) {
          // メール確認が無効なら即ログイン状態
          router.replace("/");
          router.refresh();
        } else {
          setNotice(
            "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。"
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: C.ink, border: `1px solid ${C.inkSofter}`,
    borderRadius: 10, padding: "11px 13px", color: C.paper, fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 20,
      background: `radial-gradient(120% 40% at 50% 0%, #FFFFFF 0%, ${C.ink} 60%)`,
      fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: C.inkSoft,
        border: `1px solid ${C.inkSofter}`, borderRadius: 20, padding: 26,
        boxShadow: "0 8px 30px rgba(27,42,74,0.08)",
      }}>
        {/* ロゴ＋タイトル */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
          <svg width={40} height={40} viewBox="0 0 48 48" fill="none">
            <rect x="2" y="2" width="44" height="44" rx="12" fill={C.navyDeep} />
            <path d="M12 34V15l8 11 8-11v19" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M24 31l5 5 11-14" stroke={C.gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              <span style={{ color: C.paper }}>Manage</span><span style={{ color: C.gold }}>Mate</span>
            </div>
            <div style={{ fontSize: 11, color: C.dimmer }}>あなたの仕事を支える、AIパートナー</div>
          </div>
        </div>

        {/* サインイン / サインアップ 切替 */}
        <div style={{
          display: "flex", gap: 4, background: C.ink, border: `1px solid ${C.inkSofter}`,
          borderRadius: 10, padding: 3, margin: "20px 0 18px",
        }}>
          {([["signin", "ログイン"], ["signup", "新規登録"]] as const).map(([k, l]) => {
            const on = mode === k;
            return (
              <button key={k} type="button" onClick={() => { setMode(k); setError(null); setNotice(null); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: on ? 700 : 400,
                  background: on ? C.navyDeep : "transparent", color: on ? "#fff" : C.dim,
                }}>{l}</button>
            );
          })}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="email" autoComplete="email" placeholder="メールアドレス"
            value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="パスワード（6文字以上）"
            value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />

          {error && (
            <div style={{ fontSize: 12.5, color: C.dawn, background: C.dawn + "14",
              border: `1px solid ${C.dawn}33`, borderRadius: 9, padding: "9px 11px" }}>{error}</div>
          )}
          {notice && (
            <div style={{ fontSize: 12.5, color: C.mist, background: C.mist + "14",
              border: `1px solid ${C.mist}33`, borderRadius: 9, padding: "9px 11px",
              display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Check size={14} style={{ marginTop: 1, flexShrink: 0 }} /> {notice}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            marginTop: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: busy ? C.inkSofter : C.navy, color: busy ? C.dim : "#fff",
            border: "none", padding: "12px 0", borderRadius: 11, fontSize: 14, fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}>
            {busy && <Loader size={16} className="spin" />}
            {mode === "signin" ? "ログイン" : "登録する"}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
