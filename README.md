# ManageMate

あなたの仕事を支える、AIパートナー。個人向けAI秘書タスク管理アプリ。

Next.js (App Router) + TypeScript の本番構成の土台です。フェーズ1として、
プレビュー専用だった単一Reactファイル `secretary-app.jsx` を Vercel で動く
Next.js プロジェクトへ載せ替えました。デザイン（ネイビー×ゴールド）とロジックは
そのまま維持しています。

## セットアップ

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。

## ビルド

```bash
npm run build
npm start
```

## デプロイ（Vercel）

本番は Vercel 上で動かす前提です。環境変数はローカルの `.env.local` ではなく、
**Vercel の Environment Variables** に登録します。手順は `docs/DEPLOY_VERCEL.md`。
Supabase 側の準備（プロジェクト作成・SQL 実行・キー取得・URL 設定）は
`docs/PHASE2_SUPABASE.md` を参照。

## 構成

```
app/
  layout.tsx        ルートレイアウト（<html lang="ja">、メタデータ）
  page.tsx          トップページ。ManageMateApp を描画
  globals.css       最小リセット（余白除去）
components/
  ManageMateApp.tsx アプリ本体（secretary-app.jsx を移植した単一コンポーネント）
lib/
  types.ts          共通データ型（Item / Masters / NotifySettings 等）
global.d.ts         CSS side-effect import 用の型宣言
.env.local.example  環境変数のひな形（フェーズ2/3で使用）
```

### ManageMateApp.tsx について

`secretary-app.jsx` をそのまま移植した約3100行の単一コンポーネントです。
フェーズ1では「動く土台」を優先し、ファイル冒頭に `// @ts-nocheck` を付けて
型チェックの対象外にしています（新規コードの app/・lib/ は strict TypeScript）。
フェーズ2で画面・部品・ヘルパーへ分割する際に、`lib/types.ts` の型を適用しながら
`@ts-nocheck` を外していきます。

## 現状の制約

- items（タスク/メモ/予定）は Supabase に永続化済み（ユーザーごとにRLSで分離）。
- ただし masters（分類）/ 通知設定 / 連携カレンダーはまだ React state（次の対応）。
- AI相談は `window.claude.complete` が無い環境ではローカル簡易応答にフォールバック。
  実AI連携はフェーズ3で API Route 経由に。
- カレンダー連携・通知配信はダミー表示。
- 「現在日」はデモ基準日 `2026-06-29` 固定（本番化時に実日付へ）。

## ロードマップ

- フェーズ1: Next.js プロジェクト化（完了）
- フェーズ2: Supabase 接続 — 認証・RLS の土台を実装済み（items 等の CRUD 差し替えは継続）。手順は `docs/PHASE2_SUPABASE.md`
- フェーズ3: AI連携（API Route / Edge Function 経由で Anthropic を呼ぶ）

詳細は引き継ぎ書（`ManageMate_引き継ぎ書.md`）を参照。

## 技術スタック

- Next.js 15 (App Router)
- React 19
- TypeScript
- lucide-react（アイコン）
- デプロイ: Vercel / DB・認証: Supabase / ソース管理: GitHub（予定）
