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

interface AnthropicBlock {
  type: string;
  text?: string;
  input?: unknown; // tool_use ブロックの入力（＝返してほしいJSONオブジェクト）
}
interface AnthropicResponse {
  content?: AnthropicBlock[];
}

// 全用途共通のシステムプロンプト（役割・トーン・出力ルール＝パターン2：秘書ペルソナ）。
// 個別の入力データ（分類マスタのid・今日の日付・既存データ・会話・要求キー等）は
// クライアントが組み立てる user メッセージ側に置く。
const SYSTEM_PROMPT = `あなたは「ManageMate」の有能な日本語の秘書アシスタントです。
人物像: 落ち着いて的確。前置きや冗長な説明をせず要点から述べ、丁寧だが簡潔（敬体で1〜3文）。ユーザーの意図を汲み、情報が足りないときは一度に一つだけ確認します。
役割: タスク/メモ/予定の登録・修正・検索・レポート補助、および日々の相談相手。
守ること:
- 分類(A/B/C)は、ユーザーが提示した id の中からのみ選ぶ。存在しない id や推測の id を作らない。該当なしは空文字。
- 日時は "YYYY-MM-DDTHH:MM"（終日は "YYYY-MM-DD"）。基準は日本時間(JST)。相対表現(今日/明日/来週◯曜 等)や曜日は暦どおり正確に計算する。
- 事実・数値・URL・固有名を捏造しない。未指定や不明は空にするか、会話で確認する。
- 削除や全上書きなど取り消しにくい操作は、対象が明確なときだけ行う。少しでも曖昧なら実行せず確認する。
- 応答は指定された構造データ（ツールの入力）としてのみ返し、思考や前置きは書かない。`;

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 }
    );
  }

  let prompt = "";
  // 画像添付（第1段階）。image/* のみ・最大4枚を Anthropic の画像ブロックにする。
  let imageBlocks: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];
  try {
    const body = (await req.json()) as { prompt?: unknown; attachments?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt : "";
    const atts = Array.isArray(body.attachments) ? body.attachments : [];
    imageBlocks = atts
      .filter(
        (a): a is { media_type: string; data: string } =>
          !!a &&
          typeof a === "object" &&
          typeof (a as { media_type?: unknown }).media_type === "string" &&
          typeof (a as { data?: unknown }).data === "string" &&
          (a as { media_type: string }).media_type.startsWith("image/")
      )
      .slice(0, 4)
      .map((a) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: a.media_type, data: a.data },
      }));
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
        system: SYSTEM_PROMPT,
        // 本アプリの用途は全て「JSONオブジェクトのみ」を期待する。
        // モデル互換性の高い「ツール利用（構造化出力）」で、必ず1つのJSONオブジェクトを
        // ツール入力として返させる（tool_choice で強制）。これで前置き・思考の垂れ流し・
        // 反復ループによる暴走を防ぎ、アシスタントプレフィル非対応のモデルでも動作する。
        tools: [
          {
            name: "emit_result",
            description:
              "解析結果を1つのJSONオブジェクトとして返す。キーはユーザーのプロンプトが指定する形式に従う。",
            input_schema: { type: "object" },
          },
        ],
        tool_choice: { type: "tool", name: "emit_result" },
        // 画像があれば「画像ブロック→テキスト」の順で content 配列に、無ければ従来どおり文字列。
        messages: [
          {
            role: "user",
            content: imageBlocks.length
              ? [...imageBlocks, { type: "text", text: prompt }]
              : prompt,
          },
        ],
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
    const blocks = data.content ?? [];
    // ツール利用の入力（JSONオブジェクト）を優先的に取り出す。
    const toolBlock = blocks.find(
      (b) => b.type === "tool_use" && b.input && typeof b.input === "object"
    );
    let text = "";
    if (toolBlock) {
      text = JSON.stringify(toolBlock.input);
    } else {
      // 念のためのフォールバック：text ブロックを連結
      text = blocks
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
    }

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
