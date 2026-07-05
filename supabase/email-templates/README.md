# ManageMate メールテンプレート

Supabase の認証メールを ManageMate ブランド（ネイビー×ゴールド）に差し替えるための本文です。
すべて日本語・メール表示互換（テーブル＋インラインCSS）で作成しています。

## 貼り付け場所

Supabase ダッシュボード → **Authentication → Emails（Email Templates）** で、
各テンプレートの「Message body」に対応するHTMLの中身を貼り付け、「Subject」に下記の件名を入れて保存します。

| Supabaseのテンプレート | ファイル | 件名（Subject） |
|---|---|---|
| Confirm signup（登録確認） | `confirm-signup.html` | 【ManageMate】メールアドレスの確認をお願いします |
| Reset Password（パスワード再設定） | `reset-password.html` | 【ManageMate】パスワード再設定のご案内 |
| Change Email Address（メール変更） | `change-email.html` | 【ManageMate】メールアドレス変更の確認 |
| Magic Link（マジックリンク）※任意 | `magic-link.html` | 【ManageMate】ログイン用リンク |

> メール＋パスワード認証で最低限必要なのは **Confirm signup** と **Reset Password** の2つ。
> Magic Link はパスワードなしログインを使う場合のみ。

## 使用している変数

Supabase が送信時に自動で差し込みます（そのまま残すこと）。

- `{{ .ConfirmationURL }}` … 確認/再設定/ログイン用のリンク（全テンプレート共通）
- `{{ .Email }}` / `{{ .NewEmail }}` … メール変更テンプレートで使用（変更前/変更後）

リンクの戻り先は、Authentication → URL Configuration の **Site URL / Redirect URLs**（本番URL）に従います。

## 補足（送信元・上限）

- 無料枠では Supabase 内蔵の送信を使うため、**差出人アドレスは Supabase 側**になり、送信数に上限があります。
- 独自ドメインの差出人や大量送信をしたい場合は、Authentication → **SMTP Settings** で
  自前のSMTP（Resend / SendGrid / Amazon SES 等）を設定してください（本文テンプレートはそのまま使えます）。
- 迷惑メール対策として、独自ドメイン送信時は SPF / DKIM の設定を推奨。

## プレビュー

各 `.html` をブラウザで開くと、おおよその見た目を確認できます（変数部分は `{{ ... }}` のまま表示されます）。
