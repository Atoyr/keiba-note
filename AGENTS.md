# Repository Guidelines

## プロジェクト構成

このリポジトリは、Cloudflare Workers と D1 上で動作する SvelteKit 2 / Svelte 5 アプリです。

- `src/routes/`: ページ、レイアウト、サーバーハンドラー
- `src/lib/server/`: DB、認証、サービス層。サービス層から SvelteKit を import しないこと
- `src/lib/components/`, `src/lib/utils/`: 共通 UI とユーティリティ
- `src/lib/schemas/`: Valibot の検証スキーマ
- `src/lib/server/db/schema.ts`: DB スキーマの正本
- `drizzle/`: 生成済みマイグレーション
- `e2e/`: Playwright テスト。単体テストは対象コードの隣に `*.spec.ts` として置く
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

単体テストは `*.spec.ts`、E2E テストは `e2e/*.e2e.ts` とします。認可境界、検証エラー、永続化の振る舞いを重点的に確認してください。PR 前に `pnpm run check`、`pnpm run lint`、`pnpm test` を実行します。`README.md` のモック認証を使い、他ユーザーのメモが表示されないことも確認してください。

## DB・データ・セキュリティ

マイグレーションは `pnpm run db:generate` で生成し、生成 SQL や `drizzle/meta/` を手編集しないでください。D1 クライアントはリクエストごとに作成します。メモ取得処理は `viewerId` を必須とし、`author_id` で絞り込んでください。公開範囲を参照できるのは `/notes/[id]` だけです。セッショントークンの平文保存は禁止です。YAML 変更時は `data/README.md` に従い、`pnpm run data:check` を実行します。

## コミットとプルリクエスト

コミットは履歴に合わせ、`feat:`、`fix:`、`docs:` などの Conventional Commits 接頭辞と簡潔な日本語の説明を使います。1コミットの変更目的を絞ってください。PR には変更内容、確認コマンド、関連 Issue を記載し、UI 変更にはスクリーンショットを添付します。スキーマ変更時は生成したマイグレーションもコミットしてください。
