# フェーズ3 セットアップ手順（Googleカレンダー連携）

アプリの「設定 → 連携カレンダー」で **Googleと連携** を押すと、ユーザーのGoogleカレンダーの
予定がアプリのカレンダーに表示されます（読み取り専用）。ユーザーはキーやURLの入力は不要で、
Googleの同意画面で許可するだけです。開発側（あなた）は以下を一度だけ準備します。

## 0. 事前

- フェーズ2の Supabase 認証が動いていること。
- 本番URL（例 `https://managemate.vercel.app`）が分かっていること。

## 1. Supabase にテーブルを追加

Supabase の SQL Editor で `supabase/migrations/20260705000001_google.sql` を実行。
`google_accounts`（ユーザーごとに1行、RLSで本人限定、refresh_token を保管）が作成されます。

## 2. Google Cloud プロジェクトを準備

1. https://console.cloud.google.com/ でプロジェクトを作成（既存でも可）。
2. **APIとサービス → ライブラリ** で「**Google Calendar API**」を検索して有効化。
3. **APIとサービス → OAuth 同意画面**:
   - User Type: 外部（External）。
   - アプリ名・サポートメール・デベロッパー連絡先を入力。
   - スコープに `.../auth/calendar.readonly` を追加（openid/email は既定で含まれる）。
   - テスト中は「テストユーザー」に自分のGmailを追加（公開申請しない限りテストユーザーのみ利用可）。
4. **APIとサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID**:
   - アプリケーションの種類: **ウェブ アプリケーション**。
   - **承認済みのリダイレクト URI** に以下を追加:
     - `https://<本番URL>/api/google/callback`（例 `https://managemate.vercel.app/api/google/callback`）
     - プレビューでも試すなら各プレビューURLの `/api/google/callback` も追加。
   - 作成後の **クライアント ID** と **クライアント シークレット** を控える。

## 3. Vercel に環境変数を追加

Project → Settings → Environment Variables（Production・Preview 両方）:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | OAuth クライアント シークレット |

`NEXT_PUBLIC_` は付けません（サーバー専用）。追加後は **再デプロイ**。

## 4. 動作確認

1. 本番URLにログイン → 設定 → 連携カレンダー → 「Googleと連携する」。
2. Googleの同意画面で許可 → アプリに戻り「Googleと連携中」＋取得カレンダー一覧が表示される。
3. カレンダー画面に予定が色付きで表示される。フィルタで各カレンダーの表示ON/OFFを切替可能。
4. 「連携を解除」でトークンを失効・削除。

## 仕組み（概要）

- `/api/google/connect` … 同意画面へリダイレクト（`access_type=offline` で refresh_token を取得）。
- `/api/google/callback` … 認可コードをトークンに交換し、refresh_token を `google_accounts` に保存。
- `/api/google/events` … refresh_token からアクセストークンを更新し、カレンダー一覧と予定を取得。
- `/api/google/status` / `/api/google/disconnect` … 連携状態の取得／解除。

## 現在の範囲と注意

- **読み取り専用**（予定の表示）まで。予定の作成や Google Meet の発行は未対応（必要なら別途スコープ拡張）。
- 取得範囲は「31日前〜120日後」、カレンダーは最大12件・各250件まで。
- refresh_token は `google_accounts` に平文保存（RLSで本人限定）。より厳密にするなら暗号化を検討。
- OAuth同意画面が「テスト」状態の間は、テストユーザーに追加したアカウントのみ連携可能。
