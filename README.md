# keiba-note

競馬の観戦メモを残し、レース単位／馬単位でふりかえるための Web アプリ。
Cloudflare Workers + D1 の上で動く SvelteKit アプリケーション。

- [docs/design.md](./docs/design.md) — 何を作るか（要件・データモデル・画面・フェーズ）
- [docs/architecture.md](./docs/architecture.md) — どう動き、いくらかかり、なぜその技術か

現在のフェーズ: **メモの MVP まで到達**。レース登録 → 出走馬入力 → ふりかえり →
馬タイムライン、が一通り動く。入力 UI の作り込み（馬名サジェスト等）は未着手。

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
cp .dev.vars.example .dev.vars   # Google OAuth の値を入れる（下記参照）
pnpm run db:migrate:local        # ローカル D1 にマイグレーションを適用
pnpm run dev
```

`vite dev` は platformProxy 経由で `.wrangler/state` のローカル D1 に接続する。

### Google OAuth の設定

Google Cloud Console > APIs & Services > Credentials で
OAuth 2.0 クライアント ID（種別: ウェブ アプリケーション）を作り、
**承認済みのリダイレクト URI に2つ登録する。**

```
http://localhost:5173/auth/google/callback
https://keiba-note.<subdomain>.workers.dev/auth/google/callback
```

得られた値を `.dev.vars`（ローカル）と `wrangler secret put`（本番）に入れる。

| 変数                   | 用途                             |
| ---------------------- | -------------------------------- |
| `GOOGLE_CLIENT_ID`     | OAuth クライアント ID            |
| `GOOGLE_CLIENT_SECRET` | OAuth クライアントシークレット   |
| `OWNER_EMAIL`          | 最初の1人（owner）になるアドレス |

### 開発中は認証をモックできる

メモの書き味を見るあいだは、Google OAuth を通さずに入れる。
`.dev.vars` に `MOCK_AUTH="1"` を置くと、ログイン画面を飛ばして
モックユーザー（owner / member の2人）として入る。画面上部に警告帯が出て、
そこで2人を切り替えられる。公開範囲（shared / private）の確認に使う。

**この経路は `dev` ガードの中にあり、本番ビルドには存在しない。**
`$app/environment` の `dev` はサーバー側では静的に false になるため、
分岐ごとバンドルから消える。本番で `MOCK_AUTH` を設定しても無視される。

### 最初のログイン

`user` テーブルが**空のとき**に限り、`OWNER_EMAIL` と一致するアカウントだけが
招待なしで `owner` として登録される。2人目以降は必ず招待が要る
（`user` が空でなくなるので、この口は自動的に閉じる）。

owner でログインしたら `/settings/members` から招待リンクを発行する。
リンクは1回だけ使え、7日で期限切れになる。

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
- **セッショントークンは DB に入れない。** 保存するのは SHA-256 ハッシュだけ。
- **CSRF 検証は本番ビルドでのみ有効**（SvelteKit の仕様）。
  `vite dev` では cross-origin の form POST が通るので、
  CSRF まわりの確認は `pnpm run build && pnpm run preview` で行うこと。

## ディレクトリ構成

[docs/design.md 第7章](./docs/design.md)のとおり。

```
src/
├── app.d.ts                   # App.Platform['env'] の型（Env は wrangler types が生成）
├── hooks.server.ts            # 認証。ここだけが認証方式を知っている
├── lib/
│   ├── server/
│   │   ├── db/                # Drizzle スキーマとクライアント生成
│   │   ├── auth/              # セッション / OAuth / 招待
│   │   └── services/          # 業務ロジック。SvelteKit を import しない
│   ├── schemas/               # Valibot スキーマ
│   ├── components/
│   └── utils/
└── routes/
drizzle/                       # 生成されたマイグレーション SQL
```
