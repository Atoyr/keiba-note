# k-note

競馬の観戦メモを残し、レース単位／馬単位でふりかえるための Web アプリ。
Cloudflare Workers + D1 の上で動く SvelteKit アプリケーション。

- [docs/design.md](./docs/design.md) — 何を作るか（要件・データモデル・画面・フェーズ）
- [docs/architecture.md](./docs/architecture.md) — どう動き、いくらかかり、なぜその技術か

現在のフェーズ: **予想・ふりかえり・共有が動く**。

- 事前 — 今週の重賞 → 出馬表に過去メモを並べて予想印を付ける
- 事後 — ふりかえり（1画面・1送信）→ 馬タイムラインに蓄積

**メモは既定で非公開。** 見せたいメモだけ1件ずつ共有リンクを発行して渡す。
共有ページ `/notes/[id]` はログイン不要で開けるが、検索にも一覧にも出ない。
他人のメモはどの画面にも出てこない（→ [design.md 第2章 2-2](./docs/design.md)）。

出走馬の登録は画面からではなく [data/](./data/) の YAML を PR で更新して行う。

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
https://k-note.<subdomain>.workers.dev/auth/google/callback
```

得られた値を `.dev.vars`（ローカル）と `wrangler secret put`（本番）に入れる。

| 変数                   | 用途                                  |
| ---------------------- | ------------------------------------- |
| `GOOGLE_CLIENT_ID`     | OAuth クライアント ID                 |
| `GOOGLE_CLIENT_SECRET` | OAuth クライアントシークレット        |
| `ADMIN_EMAIL`          | サイト管理者（`admin`）になるアドレス |

### 開発中は認証をモックできる

メモの書き味を見るあいだは、Google OAuth を通さずに入れる。
`.dev.vars` に `MOCK_AUTH="1"` を置くと、ログイン画面を飛ばして
モックユーザー（admin / user の2人）として入る。画面上部に警告帯が出て、
そこで2人を切り替えられる。**「他人のメモが1件も出てこない」ことの確認**に使う。

**この経路は `dev` ガードの中にあり、本番ビルドには存在しない。**
`$app/environment` の `dev` はサーバー側では静的に false になるため、
分岐ごとバンドルから消える。本番で `MOCK_AUTH` を設定しても無視される。

### アカウントとサイト管理者

**招待コードは無い。** Google アカウントがあれば誰でもログインでき、
入ってきた人には自分のメモしか見えない。グループやメンバーの概念は持たない。

ログインした email が `ADMIN_EMAIL` と一致したときだけ `role='admin'` になる。
admin ができるのは馬・レース・出走馬（全員共通のマスタ）の修正と、
ユーザーの凍結だけ。**admin でも他人のメモは読めない**
（→ [design.md 第4章](./docs/design.md)）。

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

## 出走馬データ

**画面からではなく [data/races/](./data/races/) の YAML を PR で更新して投入する。**
予想に使うには開催前に出馬表が入っている必要があり、毎週16頭を手で打つのは現実的でないため。
人でも AI でも同じ経路で入れられる。書式と投入の性質は [data/README.md](./data/README.md)。

**枠が決まる前に名前だけで登録し、確定後に同じファイルを更新してよい。**
馬が二重に作られることも、馬番の訂正で落ちることもない。

投入するのは**内容が変わったファイルだけ**（適用済みのハッシュを D1 の `data_import`
に覚えている）。投入スクリプトは冪等で、**メモ（note）には一切触れない。**

## DB マイグレーション

スキーマの正は `src/lib/server/db/schema.ts`。生成は drizzle-kit、適用は wrangler が行う。

```bash
pnpm run db:generate        # drizzle/NNNN_*.sql と drizzle/meta/ を更新
pnpm run db:migrate:local
pnpm run db:migrate:remote
```

`drizzle/meta/_journal.json` は drizzle-kit が採番に使うので、SQL を手書きせず
必ず `db:generate` を通すこと。

## Cloudflare に構築する

**まだ一度も構築していない。** `wrangler.toml` の `database_id` は
`__REPLACE_WITH_D1_DATABASE_ID__` のままで、D1 も Worker も存在しない。

`wrangler` は devDependency なので、すべて `pnpm exec` を付けて叩く。

### 1. ログイン

ブラウザが開いて認可を求められる。

```bash
pnpm exec wrangler login
```

### 2. D1 を作る

**`--location apac` を必ず付ける。** 指定を忘れるとプライマリが米国に置かれ、
1クエリあたり 100ms 以上の往復が乗る。1ページ3〜5クエリなのでそのまま体感に出るし、
**あとから移せない**（[architecture.md 第4章](./docs/architecture.md)）。

```bash
pnpm exec wrangler d1 create k-note --location apac
```

出力に `database_id` が出るので、`wrangler.toml` の `[[d1_databases]]` にある
`__REPLACE_WITH_D1_DATABASE_ID__` を置き換えてコミットする。
これは機密ではない。

```toml
[[d1_databases]]
binding = "DB"
database_name = "k-note"
database_id = "ここに貼る"
migrations_dir = "drizzle"
```

### 3. テーブルを作る

```bash
pnpm run db:migrate:remote
```

### 4. 一度デプロイして URL を知る

Google の設定にリダイレクト URI が要るが、その URL は
デプロイして初めて確定する。先に上げてしまう。
**シークレットがまだ無いのでログインはできない**が、それでよい。

```bash
pnpm run deploy
```

出力の `https://k-note.<subdomain>.workers.dev` を控える。

### 5. Google OAuth クライアントを作る

Google Cloud Console > APIs & Services > Credentials で
OAuth 2.0 クライアント ID（種別: ウェブ アプリケーション）を作り、
**承認済みのリダイレクト URI に2つ登録する。**

```
http://localhost:5173/auth/google/callback
https://k-note.<subdomain>.workers.dev/auth/google/callback
```

### 6. シークレットを入れる

3つとも、実行すると値の入力を求められる。**デプロイし直す必要はない。**

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ADMIN_EMAIL
```

`ADMIN_EMAIL` と一致する Google アカウントでログインした人だけが `admin` になる。

### 7. レースデータを投入する

```bash
pnpm run data:import:remote
```

ここまでで動く。以降は `main` にマージすれば GitHub Actions が
マイグレーション → デプロイ → データ投入まで回す（下記）。

### 確認に使うコマンド

```bash
pnpm exec wrangler whoami              # ログインできているか
pnpm exec wrangler d1 list             # D1 ができたか
pnpm exec wrangler d1 info k-note      # 場所（apac か）とサイズ
pnpm exec wrangler secret list         # 入れたシークレットの名前（値は出ない）
pnpm exec wrangler deploy --dry-run    # 上げずにビルドだけ試す
pnpm exec wrangler tail                # 本番のログを流す
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
- **メモを読む関数は `viewerId` を必須引数で受け取り、SQL の WHERE に
  `author_id = :viewer` を必ず入れる。** 省略可能にした時点で、
  絞り忘れが「全ユーザーに見える」に直結する。
  `visibility` を見てよいのは共有ページ `/notes/[id]` だけ。
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
│   │   ├── auth/              # セッション / OAuth
│   │   └── services/          # 業務ロジック。SvelteKit を import しない
│   ├── schemas/               # Valibot スキーマ
│   ├── components/
│   └── utils/
└── routes/
drizzle/                       # 生成されたマイグレーション SQL
```
