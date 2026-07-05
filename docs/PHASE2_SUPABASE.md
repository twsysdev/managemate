# フェーズ2 セットアップ手順（Supabase 接続）

このフェーズでは「認証の土台」を用意します。**ManageMate は Supabase 接続を前提**とする構成です。
Supabase プロジェクトを作成し、環境変数を設定し、SQL を実行してください。

> 環境変数（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）が未設定のままだと、
> アプリは起動時に分かりやすいエラーで停止します（フォールバックはありません）。まず下記の設定を済ませてください。

## 1. Supabase プロジェクトを作成

1. https://supabase.com にサインアップ／ログイン。
2. 「New project」を作成（Organization を選び、プロジェクト名・DBパスワード・リージョンを設定）。
   - リージョンは日本なら `Northeast Asia (Tokyo)` が近い。
3. 作成完了まで数分待つ。

## 2. URL と anon キーを取得

プロジェクトの **Settings → API** を開き、以下を控える:

- **Project URL** … `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** キー … `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> anon キーはフロントに出てよい公開値です。`service_role` キーはこのフェーズでは使いません（絶対にフロントに置かない）。

## 3. 環境変数を設定

プロジェクト直下でひな形をコピーして値を入れる:

```bash
cp .env.local.example .env.local
```

`.env.local` を編集:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env.local` は `.gitignore` 済み。コミットされません。

## 4. SQL（スキーマ＋RLS）を実行

Supabase ダッシュボードの **SQL Editor** を開き、
`supabase/migrations/20260703000001_init.sql` の中身を貼り付けて **Run**。

作成されるもの:

- テーブル: `profiles` / `items` / `masters` / `notify_settings` / `ext_calendars`
- すべてに **RLS 有効**、ポリシーは「本人（`user_id = auth.uid()`）の行のみ」read/write
- 新規ユーザー登録時に `profiles` を自動作成するトリガー

## 5. メール確認の扱い（開発時）

Supabase は既定で「メール確認（Confirm email）」が有効です。新規登録すると確認メールの
リンクを開くまでログインできません。開発中に手早く試したい場合:

- **Authentication → Providers → Email** で **Confirm email** を一時的にオフにすると、
  登録直後にそのままログイン状態になります（本番前に必ず戻す）。
- オンのままなら、登録後に届くメールのリンクを開いてから、ログインしてください。

## 6. 動作確認

> 先に 3.（環境変数）と 4.（SQL 実行）を必ず済ませること。未設定だと起動しません。

```bash
npm run dev
```

1. http://localhost:3000 を開くと `/login` にリダイレクトされる。
2. 「新規登録」でアカウント作成 →（確認オフなら）そのままアプリが開く。
3. 設定タブの一番下に「ログアウト」。押すと `/login` に戻る。
4. 別アカウントでログインし直しても、RLS により互いのデータは見えない
   items（タスク/メモ/予定）は Supabase に保存され、追加・編集・完了・削除が永続化される。

## この先（フェーズ2の続き）

- ~~`items` の読み書きを Supabase に差し替え~~ 完了（追加/編集/完了/削除を永続化）。
- `masters` / `notify_settings` / `ext_calendars` のユーザーごと保存（次の対応）。
- 初回ログイン時に既定マスタ・通知設定をシード。
