import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// AI相談のバックエンド（フェーズ3）。
// クライアントの completeAI() から { prompt } を受け取り、Anthropic Messages API を
// サーバー側で呼び出してテキストを返す。
//
// 重要:
//   - ANTHROPIC_API_KEY は「サーバー専用」の環境変数。フロントには絶対に出さない。
//     ローカルは .env.local、本番は Vercel の Environment Variables に設定する。
//   - キー未設定や上流エラー時はエラーステータスを返す。クライアント側は失敗時に
//     ローカル簡易応答（localFallbackChat）へフォールバックする。
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";

interface AnthropicTextBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicTextBlock[];
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 }
    );
  }

  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt : "";
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (!prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // モデルは環境変数で上書き可。既定はバランス型。
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return NextResponse.json(
        { error: "anthropic api error", detail },
        { status: 502 }
      );
    }

    const data = (await r.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
