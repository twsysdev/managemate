# デプロイ手順（GitHub → Vercel）

ローカルでは動かさず、Vercel 上で公開して動かす前提の手順です。
事前に `docs/PHASE2_SUPABASE.md` の 1〜2・4〜5（Supabase プロジェクト作成／
URL・anon キー取得／SQL 実行／メール確認設定）を済ませておいてください。

## 全体像

```
Supabase（DB・認証）  ←—  Vercel（Next.jsを公開）  ←—  GitHub（ソース）
```

環境変数はローカルの `.env.local` ではなく、**Vercel の Environment Variables に登録**します。
`.env.local` はローカル実行専用で、Git にも Vercel にも送られません。

## 1. GitHub にリポジトリを用意

プロジェクト直下（`package.json` がある階層＝このフォルダのルート）で:

```bash
git init
git add .
git commit -m "ManageMate: Next.js + Supabase (phase 2)"
git branch -M main
git remote add origin https://github.com/<あなた>/<リポジトリ名>.git
git push -u origin main
```

> `build/`（バージョン保管スナップショット）と `node_modules/`・`.env*.local` は
> `.gitignore` 済みで push されません。デプロイされるのはリポジトリのルート（この構成）です。

## 2. Vercel にインポート

1. https://vercel.com にログイン（GitHub 連携でサインインが楽）。
2. 「Add New… → Project」→ 先ほどの GitHub リポジトリを Import。
3. Framework Preset は **Next.js** が自動検出される。Root Directory はリポジトリ直下のまま。
4. まだ Deploy は押さず、先に環境変数を設定（次の手順）。

## 3. Vercel に環境変数を登録

Project → **Settings → Environment Variables** で、以下を追加。
対象環境は **Production** と **Preview**（できれば Development も）にチェック。

| Name | Value | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase の anon public キー |

- `NEXT_PUBLIC_` 付きはブラウザに露出してよい公開値（URL と anon キーはこれで正しい）。
- 将来フェーズ3で使う `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` は
  `NEXT_PUBLIC_` を**付けず**に登録し、サーバー側（API Route）だけで使う。
- 変数を後から変えたら **再デプロイ**が必要（ビルド時に埋め込まれるため）。

## 4. Supabase 側の URL 設定（重要）

デプロイ後に本番URL（例: `https://your-app.vercel.app`）が決まったら、Supabase の
**Authentication → URL Configuration** を設定:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**` を追加
  （プレビューURLも使うなら `https://*-<あなた>.vercel.app/**` 等も追加）

これで、新規登録の確認メールのリンクが本番アプリに戻るようになります
（アプリ側も登録時に現在のURLへ戻す `emailRedirectTo` を指定済み）。

## 5. デプロイ

Vercel の Deploy を実行（以降は `main` に push するたび自動デプロイ）。
完了後、本番URLを開くと `/login` が表示される。

## 6. 動作確認

1. 本番URLを開く → `/login` にリダイレクトされる。
2. 「新規登録」でアカウント作成。
   - メール確認が**オン**なら、届いたメールのリンクを開いて確認 → ログイン。
   - すぐ試したいときは Supabase の Email プロバイダで **Confirm email を一時オフ**にすると、
     登録直後にそのままアプリが開く（本番運用前に必ず戻す）。
3. 設定タブ最下部の「ログアウト」で `/login` に戻れる。
4. 別アカウントでログインしても、RLS により互いのデータは分離される
   items（タスク/メモ/予定）は Supabase に保存され、追加・編集・完了・削除が永続化される。

## トラブルシューティング

- **開いた瞬間にエラーで落ちる**: Vercel の環境変数が未設定/typo。名前と値、対象環境を確認して再デプロイ。
- **確認メールのリンクがローカルや別URLに飛ぶ**: Supabase の Site URL / Redirect URLs が未設定。手順4を確認。
- **ログインできるが他人のデータが見える**: SQL（RLS）が未実行。`docs/PHASE2_SUPABASE.md` の手順4を実行。

## 別解: Vercel CLI で直接デプロイ（GitHubを使わない場合）

```bash
npm i -g vercel
vercel            # 初回はプロジェクト作成の対話
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod     # 本番デプロイ
```
