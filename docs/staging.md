# ステージング（Workers Preview）

固定名 `staging` の Workers Preview を、リリース前の確認環境として使う。

作成日: 2026-09-23 / 最終更新日: 2026-10-13

- **読む場面:** ステージングを更新する・確認する・Google ログインや通知を設定するとき
- **ここに無いもの:** 本番の構築とリダイレクト URI を足す手順は [operations.md](./operations.md)。
  通知の設定は [monitoring.md](./monitoring.md)。ステージングの目印の見た目は [design-system.md 2-4](./design-system.md)

- URL: <https://staging-k-note.lessironglance.workers.dev>
- D1: `k-note-staging`（APAC。`database_id` は `wrangler.toml` の `[[previews.d1_databases]]` が正）
- 本番: Worker `k-note` と D1 `k-note`。`wrangler.toml` のトップレベル設定を使う
- 見分け方: タブのアイコンが暗い地に灰色の蹄鉄になり、ページの一番上に「ステージング環境」の帯が出る。
  `[previews.vars]` の `APP_ENV = "staging"` を見ている（→ [design-system.md 2-4](./design-system.md)）

`wrangler.toml` の `[[previews.d1_databases]]` がステージング D1 を `DB` にバインドする。
`wrangler.preview-migrations.toml` は同じ D1 にマイグレーションを適用するための設定。
この2ファイルの `database_id` は常に一致させる（値は書き写さず、`wrangler.toml` を見る）。
別の Preview を作った場合も、設定を変えない限り同じステージング D1 を共有する。

## 自動反映

`main` への push で動く `CI` ワークフローが成功すると、`staging.yml` が
そのコミットをチェックアウトして以下の順に実行する。

1. ステージング D1 にマイグレーション
2. 出走馬データ（YAML）をステージング D1 に投入
3. 固定名 `staging` の Preview にアプリをデプロイ

CI 中にさらに新しいコミットが `main` に入った場合、古いコミットの反映をスキップする。
本番への出走馬データの投入（`data-import.yml`）と本番のアプリのデプロイ（`deploy.yml`）は、
ステージングとは独立して動く。

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
pnpm run deploy:staging --secrets-file ~/staging-secrets.json
```

`deploy:staging` に `--secrets-file` を付けないと、ステージングのシークレットが消えてログインできなくなる
（→ [シークレットはデプロイのたびに渡す](#シークレットはデプロイのたびに渡す)）。

`data:import:staging` はステージング D1 の `data_import` を読み、**変わったファイルだけ**を流す
（`--target staging`）。`data:import:remote` は本番 D1 を参照して差分を判定するため、
ステージングへの投入には使わない。
ステージングのデータを変更しても本番 D1 には反映されない。

**全ファイルを流し直す（`--all`）経路を自動反映に入れないこと。** D1 の書き込みの枠は
**アカウント単位で本番と共有**している。全ファイルの投入は1回で約1万7千行を書き、マージが続くと Free の上限（1日10万行）を使い切って
本番のメモの保存が落ちる（経緯は [architecture.md 第6章](./architecture.md)）。Paid では落ちずに課金に回るので、
暴走は使用量の通知で見る（→ [monitoring.md 9-2](./monitoring.md)）。
ステージングのデータを作り直したいときだけ、手で流す。

```bash
pnpm run data:sql:staging -- --all
pnpm exec wrangler d1 execute PREVIEW_DB --remote --config wrangler.preview-migrations.toml --file .wrangler/import-races-staging.sql
```

## Google ログイン

Google Cloud Console の OAuth クライアントに次の承認済みリダイレクト URI を足す
（画面と本番側の URI は [operations.md 5](./operations.md)）。

```text
https://staging-k-note.lessironglance.workers.dev/auth/google/callback
```

### シークレットはデプロイのたびに渡す

Preview のシークレットは Preview ではなく**デプロイごと**に付く。`wrangler preview` は前のデプロイの
シークレットを引き継がず、`wrangler.toml` の設定と `--secrets-file` で渡したものだけで新しいデプロイを作る。
`wrangler preview secret put` で入れても、次のデプロイで消えてログインできなくなる
（2026-10 に起きた。`pnpm exec wrangler preview secret list --name staging` で最新デプロイの名前だけ見られる）。

そこで値は GitHub の Actions の Secret に置き、`staging.yml` が毎回 `--secrets-file` で渡す。
値はリポジトリに保存しない。

| Actions の Secret              | Preview での名前       | 無いとき（`staging.yml`）                                  |
| ------------------------------ | ---------------------- | ---------------------------------------------------------- |
| `STAGING_GOOGLE_CLIENT_ID`     | `GOOGLE_CLIENT_ID`     | D1 に当てる前に落とす。入れずに出すとログインできない      |
| `STAGING_GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | 同上                                                       |
| `STAGING_ADMIN_EMAIL`          | `ADMIN_EMAIL`          | 同上。入れずに出すとログインはできるが、誰も管理者になれない |
| `STAGING_DISCORD_WEBHOOK_URL`  | `DISCORD_WEBHOOK_URL`  | 渡さない。staging からは通知しない                         |

Actions の Secret は登録したあと読み出せない。値の元は Google Cloud Console の OAuth クライアントと、
管理者にするメールアドレス・Discord の Webhook。差し替えるときは Actions の Secret を入れ直し、
Actions の「ステージング」を手動で流す。

障害の通知（→ [monitoring.md](./monitoring.md)）を staging から受けると、通知の `Environment` 欄は `staging` になる
（`wrangler.toml` の `[previews.vars]`）。`GITHUB_DISPATCH_TOKEN` は渡さない（ステージングから本番のデータの PR を作らせない）。

手元から `pnpm run deploy:staging` を流すときも同じで、`--secrets-file` を付けないとシークレットが消える。
手元には「揃っているか」の確認が無いので、デプロイは Actions の手動実行を使う。
どうしても手元から出すときは、表の `Preview での名前` をキーにした JSON（少なくとも上の3つ）を
リポジトリのチェックアウトの外（worktree の親の `../` は本体のチェックアウトの中になる）に置いて渡す。

```bash
pnpm run deploy:staging --secrets-file ~/staging-secrets.json
```

PR ごとの Preview も使うなら、`wrangler preview base-config secret put <NAME>` で
新規 Preview 用の共通シークレットを別途設定する。
Base 設定の変更は既存 Preview に反映されない。
Base 設定のシークレットが Preview の2回目以降のデプロイにも残るかは確かめていない
（残らなければ上と同じ理由で消える。2回出してから `wrangler preview secret list` で見る）。
Google OAuth は Preview ごとに URL が変わるため、ログイン確認には固定名の
`staging` を使う。

公開 URL は既定で誰でも開ける。関係者だけに見せる場合は Cloudflare Access で
Preview URL へのアクセスを制限する。
