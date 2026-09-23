# k-note

競馬の観戦メモを残し、レース単位／馬単位でふりかえるための Web アプリ。
Cloudflare Workers + D1 の上で動く SvelteKit アプリケーション。

| 文書                                           | 何が書いてあるか                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| [docs/design.md](./docs/design.md)             | 何を作るか（要件・データモデル・画面・フェーズ）                            |
| [docs/architecture.md](./docs/architecture.md) | どう動き、いくらかかり、なぜその技術か                                      |
| [docs/harness.md](./docs/harness.md)           | ハーネスの設計（目的・構造の制約・デザインシステム・操作・検証・評価の6層） |
| [docs/operations.md](./docs/operations.md)     | Cloudflare の構築と、GitHub Actions でのデプロイ                            |
| [AGENTS.md](./AGENTS.md)                       | コードを変えるときの約束と手順（人も AI エージェントも同じ）                |
| [data/README.md](./data/README.md)             | 出走馬データ（YAML）の書式と投入                                            |

現在のフェーズ: **予想・ふりかえり・共有が動く**。

- 事前 — 今週の重賞 → 出馬表に過去メモを並べて予想印を付ける。
  **出馬表が出る前でも「レースの見立て」は書ける**（出走馬0頭のレースでも予想画面が開く）
- 事後 — ふりかえり（1画面・1送信）→ 馬タイムラインに蓄積。
  **ふりかえりは開催後だけ。** 開催前のレースを開くと予想画面へ送られる

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
E2E は別の `.wrangler/e2e` を毎回空にして使うので、ここに入れたデータは E2E に混ざらない。

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

| コマンド                                   | 内容                                       |
| ------------------------------------------ | ------------------------------------------ |
| `pnpm run dev`                             | 開発サーバー                               |
| `pnpm run check`                           | `wrangler types --check` + `svelte-check`  |
| `pnpm run lint` / `pnpm run format`        | Prettier + ESLint                          |
| `pnpm run test:unit`                       | Vitest                                     |
| `pnpm run test:e2e`                        | Playwright（本番ビルド + E2E 専用 D1）     |
| `pnpm run verify`                          | check / lint / test:unit / test:e2e を順に |
| `pnpm run screens <機能名> <before/after>` | PR 用の画面キャプチャ（docs/harness.md）   |
| `pnpm run db:generate`                     | `schema.ts` から `drizzle/*.sql` を生成    |
| `pnpm run db:migrate:local`                | ローカル D1 に適用                         |
| `pnpm run db:migrate:remote`               | 本番 D1 に適用                             |
| `pnpm run deploy`                          | ビルドして `wrangler deploy`               |

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

## 開発に参加する

コードを変えるときの約束（`viewerId` の必須化、D1 クライアントの生成場所などの
ランタイム上の約束を含む）と、PR までの手順は [AGENTS.md](./AGENTS.md) にある。
人も AI エージェントも同じものに従う。

## デプロイと運用

アプリはリリースの publish で、レースデータは `main` へのマージで本番に出る（別系統）。
Cloudflare の構築手順・API トークンの権限・ワークフローの中身は
[docs/operations.md](./docs/operations.md)。

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
