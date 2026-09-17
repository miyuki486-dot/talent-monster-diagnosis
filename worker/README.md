# LINE連携バックエンド

Cloudflare WorkersとD1で、受取コード発行・LINE照合・個別結果URL発行を行います。

## 保存期間

- 受取コード: 診断から30日
- 個別結果URL: 診断から30日
- 自由回答を含む受取用データ: 診断から90日
- 匿名分析データ: 長期保存
- LINE Webhook重複防止データ: 7日
- アクセス回数制御データ: 2日

## 公開前にCloudflareへ登録するSecret

値をファイルやGitHubへ書かず、CloudflareのSecret欄へ直接登録します。

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `RECEIPT_CODE_PEPPER`（十分に長いランダム文字列）
- `LINE_USER_HASH_PEPPER`（十分に長いランダム文字列）
- `IP_HASH_PEPPER`（十分に長いランダム文字列）

## 今回の更新を公開するときの作業順

1. 既存D1へ `migrations/0002_monster_variant.sql` を1回だけ適用する
2. Workerを更新し、`/health`と自動テストを確認する（旧8問データも移行中は受付可能）
3. ローカル／実機で、診断→コード送信→詳細結果のWeb表示を確認する（PDF保存は別タスク）
4. 問題がなければ、最後にGitHub Pagesを更新する

本番D1へ `schema.sql` を再適用しないでください。新規環境を作る場合だけ `schema.sql` を使います。

## ローカルテスト

Node.jsだけで診断ロジック、D1相当の保存、LINE照合、個別結果取得をテストできます。

```text
node --test test/*.test.js
```

認証情報を必要としないテスト用の値だけを使い、実際のLINEやCloudflareへは送信しません。
