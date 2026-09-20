# keiba-note

競馬の観戦メモを残し、レース単位／馬単位でふりかえるための Web アプリ。
Cloudflare Workers + D1 の上で動く SvelteKit アプリケーション。

- [docs/design.md](./docs/design.md) — 何を作るか（要件・データモデル・画面・フェーズ）
- [docs/architecture.md](./docs/architecture.md) — どう動き、いくらかかり、なぜその技術か

現在のフェーズ: **Phase 0（土台）完了**。認証・CRUD・メモ機能は Phase 1 以降。

## 技術スタック

| レイヤ         | 採用                                         |
| -------------- | -------------------------------------------- |
| フレームワーク | SvelteKit 2 / Svelte 5 (runes)               |
| アダプタ       | `@sveltejs/adapter-cloudflare`               |
| 実行環境       | Cloudflare Workers                           |
| DB             | Cloudflare D1 (SQLite) — プライマリは `apac` |
| ORM            | Drizzle ORM + drizzle-kit                    |
| 検証           | Valibot                                      |
| スタイル       | Tailwind CSS v4                              |
| テスト         | Vitest / Playwright                          |
| パッケージ管理 | pnpm                                         |

## セットアップ

```bash
pnpm install
pnpm run db:migrate:local   # ローカル D1 にマイグレーションを適用
pnpm run dev
```

`vite dev` は platformProxy 経由で `.wrangler/state` のローカル D1 に接続する。

## よく使うコマンド

| コマンド                            | 内容                                      |
| ----------------------------------- | ----------------------------------------- |
| `pnpm run dev`                      | 開発サーバー                              |
| `pnpm run check`                    | `wrangler types --check` + `svelte-check` |
| `pnpm run lint` / `pnpm run format` | Prettier + ESLint                         |
| `pnpm run test:unit`                | Vitest                                    |
| `pnpm run test:e2e`                 | Playwright                                |
| `pnpm run db:generate`              | `schema.ts` から `drizzle/*.sql` を生成   |
| `pnpm run db:migrate:local`         | ローカル D1 に適用                        |
| `pnpm run db:migrate:remote`        | 本番 D1 に適用                            |
| `pnpm run deploy`                   | ビルドして `wrangler deploy`              |

## DB マイグレーション

スキーマの正は `src/lib/server/db/schema.ts`。生成は drizzle-kit、適用は wrangler が行う。

```bash
pnpm run db:generate        # drizzle/NNNN_*.sql と drizzle/meta/ を更新
pnpm run db:migrate:local
pnpm run db:migrate:remote
```

`drizzle/meta/_journal.json` は drizzle-kit が採番に使うので、SQL を手書きせず
必ず `db:generate` を通すこと。

## Cloudflare の設定

D1 は `--location apac` で作る。指定を忘れるとプライマリが米国に置かれ、
1クエリあたり 100ms 以上の往復が乗る（[architecture.md 第4章](./docs/architecture.md)）。

```bash
wrangler login
wrangler d1 create keiba-note --location apac
# 出力された database_id を wrangler.toml の [[d1_databases]] に書く
```

### ランタイム上の約束

- **`nodejs_compat` は付けない。** 起動コストとバンドルが増える。
  採用ライブラリはすべて Web 標準 API だけで動く。
  `compatibility_flags` の `nodejs_als` は adapter-cloudflare が
  AsyncLocalStorage を使うために必要な別のフラグ。
- `compatibility_date` は初期化時の日付（2026-09-20）で固定。上げるときは意図的に上げる。
- D1 クライアントは**リクエストごとに** `createDb(platform.env)` で作る。
  モジュールスコープに接続やユーザー情報を持たせない（Workers の実行環境は
  複数リクエストで再利用されるため漏れる）。
- 1リクエストあたりの D1 クエリは10以内（Free の上限は50）。
  超えそうなら JOIN か `batch()` にまとめる。

## ディレクトリ構成

[docs/design.md 第7章](./docs/design.md)のとおり。

```
src/
├── app.d.ts                   # App.Platform['env'] の型（Env は wrangler types が生成）
├── hooks.server.ts            # 認証。Phase 1 で追加
├── lib/
│   ├── server/
│   │   ├── db/                # Drizzle スキーマとクライアント生成
│   │   ├── auth/              # セッション / OAuth / 招待（Phase 1）
│   │   └── services/          # 業務ロジック。SvelteKit を import しない
│   ├── schemas/               # Valibot スキーマ
│   ├── components/
│   └── utils/
└── routes/
drizzle/                       # 生成されたマイグレーション SQL
```
