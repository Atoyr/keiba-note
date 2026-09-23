# ステージング（Workers Preview）

固定名 `staging` の Workers Preview を、リリース前の確認環境として使う。

- URL: <https://staging-k-note.lessironglance.workers.dev>
- D1: `k-note-staging`（APAC、ID `cb00f7c8-a0ed-4531-a39d-cde76b0d90bd`）
- 本番: Worker `k-note` と D1 `k-note`。`wrangler.toml` のトップレベル設定を使う
- 見分け方: タブのアイコンが灰色の蹄鉄になり、ページの一番上に「ステージング環境」の帯が出る。
  `[previews.vars]` の `APP_ENV = "staging"` を見ている（→ [design-system.md 2-4](./design-system.md)）

`wrangler.toml` の `[[previews.d1_databases]]` がステージング D1 を `DB` にバインドする。
`wrangler.preview-migrations.toml` は同じ D1 にマイグレーションを適用するための設定。
この2ファイルの `database_id` は常に一致させる。
別の Preview を作った場合も、設定を変えない限り同じステージング D1 を共有する。

## 自動反映

`main` への push で動く `CI` ワークフローが成功すると、`staging.yml` が
そのコミットをチェックアウトして以下の順に実行する。

1. ステージング D1 にマイグレーション
2. レース YAML をステージング D1 に投入
3. 固定名 `staging` の Preview にアプリをデプロイ

CI 中にさらに新しいコミットが `main` に入った場合、古いコミットの反映をスキップする。
`data-import.yml` による本番レースデータ投入と、リリース時の本番アプリデプロイは
これまでどおり独立して動く。

Actions の「ステージング」から Run workflow で手動でも流せる。
Cloudflare 側の都合で失敗したときのやり直しや、トークンの権限を直したあとの確認に使う。
手動実行は `main` だけを受け付け、実行した時点の `main` の先頭を出す。
自動反映と違って CI の成功は確かめないので、`main` の CI が通っていることを見てから流す。
ほかのブランチを選ぶとジョブはスキップされる（ステージング D1 に `main` に無い
マイグレーションが当たると戻せないため）。

## 更新手順

手動で更新するときは、Cloudflare にログイン済みの端末で実行する。

```bash
pnpm run data:check
pnpm run db:migrate:staging
pnpm run data:import:staging
pnpm run deploy:staging
```

`data:import:staging` は全 YAML を対象に SQL を作る。
通常の `data:import:remote` は本番 D1 を参照して差分を判定するため、
ステージングへの投入には使わない。
ステージングのデータを変更しても本番 D1 には反映されない。

## Google ログイン

Google Cloud Console の OAuth クライアントに次の承認済みリダイレクト URI を登録する。

```text
https://staging-k-note.lessironglance.workers.dev/auth/google/callback
```

そのクライアントの値を固定 Preview にシークレットとして設定する。
値はリポジトリに保存しない。

```bash
pnpm exec wrangler preview secret put GOOGLE_CLIENT_ID --name staging
pnpm exec wrangler preview secret put GOOGLE_CLIENT_SECRET --name staging
pnpm exec wrangler preview secret put ADMIN_EMAIL --name staging
```

障害の通知（→ [monitoring.md](./monitoring.md)）を staging からも受けたいときは、
`DISCORD_WEBHOOK_URL` も同じように入れる。通知の `Environment` 欄は `staging` になる
（`wrangler.toml` の `[previews.vars]`）。入れなければ staging からは通知しない。

PR ごとの Preview も使うなら、`wrangler preview base-config secret put <NAME>` で
新規 Preview 用の共通シークレットを別途設定する。
Base 設定の変更は既存 Preview に反映されない。
Google OAuth は Preview ごとに URL が変わるため、ログイン確認には固定名の
`staging` を使う。

公開 URL は既定で誰でも開ける。関係者だけに見せる場合は Cloudflare Access で
Preview URL へのアクセスを制限する。
