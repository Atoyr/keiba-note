# Repository Guidelines

## プロジェクト構成

このリポジトリは、Cloudflare Workers と D1 上で動作する SvelteKit 2 / Svelte 5 アプリです。
着手前に `README.md` の「ランタイム上の約束」と `docs/design.md`、
`docs/architecture.md` を確認してください。

- `src/routes/`: ページ、レイアウト、サーバーハンドラー
- `src/lib/server/`: DB、認証、サービス層。サービス層から SvelteKit を import しないこと
- `src/lib/components/`, `src/lib/utils/`: 共通 UI とユーティリティ
- `src/lib/schemas/`: Valibot の検証スキーマ
- `src/lib/server/db/schema.ts`: DB スキーマの正本
- `drizzle/`: 生成済みマイグレーション
- `e2e/`: Playwright テスト。単体テストは対象コードと同じ `src/` 配下に置く
- `data/races/`: レースデータの YAML。設計資料は `docs/` に置く

## ビルド・テスト・開発コマンド

パッケージ管理には pnpm を使用します。

- `pnpm install`: 依存関係をインストール
- `pnpm run db:migrate:local`: ローカル D1 を更新
- `pnpm run dev`: Vite 開発サーバーを起動。事前に `.dev.vars.example` を `.dev.vars` へコピーする
- `pnpm run check`: Worker 型を生成し、Svelte と TypeScript を検査
- `pnpm run lint`: Prettier と ESLint を実行
- `pnpm run test:unit -- --run`: Vitest を1回実行
- `pnpm run test:e2e`: ビルド、プレビュー、Playwright テストを実行
- `pnpm run build`: Cloudflare 向けビルドを生成
- `pnpm run data:check`: D1 を変更せずレース YAML を検証

## コーディング規約

TypeScript は strict モードです。Prettier の設定はタブ、シングルクォート、末尾カンマなし、1行100文字です。提出前に `pnpm run format` を実行してください。SvelteKit の命名規則（`+page.svelte`、`+page.server.ts`、`+server.ts`）に従います。コンポーネントは PascalCase、関数と変数は camelCase にします。

## テスト方針

サーバー処理と純粋関数は `src/**/*.spec.ts`（Node）、Svelte コンポーネントは
`src/**/*.svelte.test.ts`（Chromium）、E2E は `e2e/*.e2e.ts` とします。変更した分岐を
最低1本は通し、特に権限条件、リダイレクト、日付境界をテストしてください。
`expect.requireAssertions` が有効なため、アサーションのないテストは失敗します。

画面、ルーティング、認可を変更した場合は E2E を追加または更新し、未ログイン状態や
他ユーザーの ID でアクセスできないことを確認します。form POST は本番ビルド相当の E2E で
CSRF を検証してください。`.only` や `test.skip` は残しません。コード変更後は次をすべて通します。

```bash
pnpm run check
pnpm run lint
pnpm run test:unit -- --run
pnpm run test:e2e
```

CI も同じ検証を実行します。`data/` を変更した場合は `pnpm run data:check` も必要です。
省略した検証がある場合は、その理由を PR 本文に明記してください。

## DB・データ・セキュリティ

マイグレーションは `pnpm run db:generate` で生成し、生成 SQL や `drizzle/meta/` を手編集しないでください。D1 クライアントはリクエストごとに作成します。メモ取得処理は `viewerId` を必須とし、`author_id` で絞り込んでください。公開範囲を参照できるのは `/notes/[id]` だけです。セッショントークンの平文保存は禁止です。YAML 変更時は `data/README.md` に従い、`pnpm run data:check` を実行します。

## コミットとプルリクエスト

コミットは履歴に合わせ、`feat:`、`fix:`、`docs:` などの Conventional Commits 接頭辞と
簡潔な日本語の説明を使い、目的を1つに絞ります。スキーマ変更時は生成したマイグレーションも
コミットしてください。

PR は `.github/pull_request_template.md` を日本語で埋め、変更理由、レビュー観点、確認結果、
関連 Issue を記載します。見た目や画面遷移の変更には変更後、既存画面の修正には before / after の
画像を `docs/screenshots/<機能名>/` にコミットしてください。撮影には `MOCK_AUTH="1"` を使い、
実在のメールアドレスや本番データを写さないでください。PR 本文にはブランチ名ではなくコミット
SHA を含む GitHub raw URL で画像を貼ります。UI を変更しない場合は、テストやデータ検証の
実行ログ、または CI run のリンクを証跡として添えます。`data/` の変更はリリースを待たず
`data-import.yml` から本番反映されるため、その旨も明記してください。
