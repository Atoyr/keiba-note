# uma-memo 運用手順 — Cloudflare の構築とデプロイ

人が行う運用の手順書。Cloudflare への構築、シークレットと Actions の設定、デプロイ、ワークフローの一覧、
バックアップ、問い合わせへの対応を書く。

作成日: 2026-09-23 / 最終更新日: 2026-10-13

- **読む場面:** Cloudflare を作り直す・シークレットや API トークンを入れる・GitHub Actions を設定する・
  リリースを出す・独自ドメインを触る・バックアップを取る・アカウントの削除を頼まれたとき。日々の開発では読まなくてよい
- **ここに無いもの:** デプロイ構成の図と、アプリとデータを別系統で出す理由は [architecture.md 第4章](./architecture.md)。
  ログ・通知・死活監視と、通知の Webhook の値は [monitoring.md](./monitoring.md)。
  ステージングの更新は [staging.md](./staging.md)。出走馬データ（YAML）の書式は [data/README.md](../data/README.md)

## 名前について

アプリ名は **uma-memo**（旧名 k-note）。変えたのは画面に出る名前と URL（`https://uma-memo.com`）だけで、
次のものは**旧名のまま**にしてある。

| もの                                           | 名前       | 変えない理由                                            |
| ---------------------------------------------- | ---------- | ------------------------------------------------------- |
| GitHub のリポジトリ                            | `keiba-note` | clone 済みの remote や Actions の設定を巻き込むため     |
| Worker（`wrangler.toml` の `name`）            | `k-note`   | 変えると別の Worker ができ、シークレットも入れ直しになる |
| D1（`database_name`）                          | `k-note`   | 名前は変えられない。作り直すとデータの移し替えになる    |
| Google Cloud のプロジェクト・OAuth クライアント | 旧名のまま | リダイレクト URI を足すだけで足りる                     |

コマンドや設定に出てくる `k-note` は、この表のどれかを指している。**揃えようとして書き換えないこと。**

## Cloudflare に構築する

**構築済み。** D1 `k-note`（APAC）と Worker `k-note` は作成され、
`wrangler.toml` の `database_id` にも実値が入っている。
以下は**作り直すときの手順**として残してある。上から順に 1〜9 を行う。

`wrangler` は devDependency なので、すべて `pnpm exec` を付けて叩く。

### 1. ログイン

ブラウザが開いて認可を求められる。

```bash
pnpm exec wrangler login
```

### 2. D1 を作る

**`--location apac` を必ず付ける。** 指定を忘れるとプライマリが米国に置かれ、
1クエリあたり 100ms 以上の往復が乗る。1ページ3〜5クエリなのでそのまま体感に出るし、
**あとから移せない**（[architecture.md 第4章](./architecture.md)）。

```bash
pnpm exec wrangler d1 create k-note --location apac
```

出力に `database_id` が出るので、`wrangler.toml` の `[[d1_databases]]` にある
`database_id` を書き換えてコミットする。これは機密ではない。

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

`wrangler.toml` の `routes` が `uma-memo.com` の custom domain を張るので、ゾーン `uma-memo.com` が
同じ Cloudflare アカウントに無い、または apex に既存の A / AAAA / CNAME レコードがあると、このデプロイは落ちる。
先に 7 の前提（ゾーンの追加、既存レコードの削除）を済ませておく。API トークンの権限は
[動かすのに必要な設定](#動かすのに必要な設定) の 1。

```bash
pnpm run deploy
```

出力の `https://k-note.<subdomain>.workers.dev` を控える。

### 5. Google OAuth クライアントを作る

Google Cloud Console > APIs & Services > Credentials で
OAuth 2.0 クライアント ID（種別: ウェブ アプリケーション）を作り、
**承認済みのリダイレクト URI に3つ登録する。** ここがリダイレクト URI の正で、
[README.md](../README.md) と `.dev.vars.example` はこの節を指す。

```
http://localhost:5173/auth/google/callback
https://uma-memo.com/auth/google/callback
https://k-note.<subdomain>.workers.dev/auth/google/callback
```

ステージングで Google ログインを確かめるなら、その URI も足す（→ [staging.md](./staging.md#google-ログイン)）。

同じ画面の **OAuth 同意画面**（Google Auth Platform > ブランディング / 対象）を埋めて、
公開ステータスを「本番環境」にする。「テスト」のままだと、テストユーザーに登録した
Google アカウント（100 件まで）しかログインできない。

| 項目                                         | 値                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| アプリ名                                     | `uma-memo`                                                                         |
| ユーザーサポートメール・デベロッパーの連絡先 | 運営者のアドレス（画面には出ない。Google からの連絡用）                            |
| アプリのホームページ                         | `https://uma-memo.com/`（未ログインだと紹介ページ。ポリシーへのリンクがある）      |
| アプリのプライバシー ポリシー                | `https://uma-memo.com/privacy`                                                     |
| アプリの利用規約                             | `https://uma-memo.com/terms`                                                       |
| 承認済みドメイン                             | `uma-memo.com`                                                                     |
| ユーザーの種類                               | 外部                                                                               |
| スコープ                                     | `openid`・`.../auth/userinfo.email`・`.../auth/userinfo.profile`                   |

要求するスコープは機密でないものだけなので、本番環境にするのにスコープの審査は要らない。
ロゴを載せるとブランドの確認が要るので、載せない。

ポリシーと規約の本文は `src/routes/privacy/`・`src/routes/terms/` にある。取る情報や
使う外部サービスを変えたら、本文と最終改定日も直す。

### 6. シークレットを入れる

どれも、実行すると値の入力を求められる。**デプロイし直す必要はない。**
アプリのシークレットは Cloudflare 側に1回だけ入れればよく、**GitHub 側には要らない**（毎回のデプロイで入れ直す必要もない）。

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ADMIN_EMAIL
pnpm exec wrangler secret put DISCORD_WEBHOOK_URL
pnpm exec wrangler secret put GITHUB_DISPATCH_TOKEN
```

`ADMIN_EMAIL` と一致する Google アカウントでログインした人だけが `admin` になる。

`DISCORD_WEBHOOK_URL` は障害を知らせる Discord の Webhook。入れなければ通知だけが止まり、アプリは動く。
Worker と Actions の両方が Discord に送るので**両方に入れる**。差し替えるときも両方
（値の一覧と差し替え手順は [monitoring.md 第8章](./monitoring.md)）。

`GITHUB_DISPATCH_TOKEN` は、出走馬・結果の取得（`race-data-fetch.yml`）とオッズの更新（`odds-update.yml`）を
GitHub Actions に頼むトークン（→ [architecture.md 3-8・3-9](./architecture.md)）。入れなければ、
枠順などの定期取得と開催日の結果の取得と管理画面の「出走馬を取得」と、オッズの更新が止まる。
GitHub > Settings > Developer settings > Fine-grained tokens で次のように作る。

| 項目                                | 設定                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Resource owner / Repository access | `Atoyr` / Only select repositories → `keiba-note`                                      |
| Repository permissions              | `Actions: Read and write` だけ（Metadata: Read は自動で付く）                          |
| Expiration                          | 1年以内。切れると Cron が `entries.dispatch`・`odds.dispatch`（`auth`）・`results.dispatch.missed` で知らせる |

リポジトリ名は `wrangler.toml` の `[vars]` の `GITHUB_REPOSITORY`（シークレットではない）。
Actions 側にも設定が1つ要る（→ 9。[動かすのに必要な設定](#動かすのに必要な設定) の 5）。

### 7. 独自ドメインを当てる

`wrangler.toml` の `routes` に `uma-memo.com` を `custom_domain = true` で書いてある。
ゾーン `uma-memo.com` が同じ Cloudflare アカウントにあれば、デプロイ時に
DNS レコードと証明書を Cloudflare が作る。ゾーンの追加や Google の URI の追加など、
workers.dev で動いていたものへ後から当てる順序は [独自ドメインへ移す](#独自ドメインへ移す)。

### 8. 出走馬データを投入する

```bash
pnpm run data:import:remote
```

### 9. GitHub Actions を設定する

Actions のシークレット・変数と、Actions に PR を作らせる設定を
[動かすのに必要な設定](#動かすのに必要な設定) の 1〜5 に従って入れる。

ここまでで動く。以降は GitHub でリリースを publish すれば Actions がマイグレーション → デプロイまで回す。
出走馬データは `main` へのマージで入る（[デプロイ](#デプロイgithub-actions)）。

### 確認に使うコマンド

```bash
pnpm exec wrangler whoami              # ログインできているか
pnpm exec wrangler d1 list             # D1 ができたか
pnpm exec wrangler d1 info k-note      # 場所（apac か）とサイズ
pnpm exec wrangler secret list         # 入れたシークレットの名前（値は出ない）
pnpm exec wrangler deploy --dry-run    # 上げずにビルドだけ試す
pnpm exec wrangler tail                # 本番のログを流す（Workers Logs は monitoring.md 第2章）
```

## デプロイ（GitHub Actions）

ワークフローは9本。**アプリと出走馬データは別系統で出る**（理由は [architecture.md 第4章](./architecture.md)）。

| ワークフロー                         | きっかけ                                                                                | すること                                                                                                       | 本番に効くか                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ci.yml`                             | PR・`main` への push・`workflow_call`（`deploy.yml` から）                              | 検証（`data:check` / `check` / `lint` / `test:unit`）と E2E（一部の PR では飛ばす。→ [testing.md 第1章](./testing.md#1-何をどこで確かめるか)）。`main` で落ちたときだけ Discord「デプロイ」へ      | 効かない                                            |
| `pr-body.yml`                        | PR の作成・本文の編集                                                                   | PR 本文の欄が埋まっているかの検査と、起動すべきレビュアーの出力                                                | 効かない                                            |
| `staging.yml`                        | `main` の CI 成功 / 手動                                                                | ステージング D1 にマイグレーションと出走馬データを入れ、固定名 `staging` の Preview にデプロイ（→ [staging.md](./staging.md)） | ステージングだけ                                    |
| `deploy.yml`                         | リリースの publish / 手動                                                               | `ci.yml` の再実行 → マイグレーション → `wrangler deploy`。成功も失敗も Discord「デプロイ」へ                   | **アプリが本番に出る**（出るのはここだけ）          |
| `data-import.yml`                    | `main` の `data/races/**` の変更                                                        | `data:check` → `data:import:remote`。失敗だけ Discord「デプロイ」へ                                            | **出走馬データが本番に入る**（リリースを待たない）  |
| `race-data-fetch.yml`                | Worker の Cron（出走馬・結果）・管理画面の「出走馬を取得」・手動                        | netkeiba から出走馬（過去5走つき）・結果を取り、`data/races/*.yaml` を書いて PR を作る。D1 には触らない                       | PR をマージしたとき（`data-import.yml` 経由）       |
| `odds-update.yml`                    | Worker の Cron が `workflow_dispatch` で起動（`main` からしか動かない）                 | オッズを取り、`race_odds` に `wrangler d1 execute --remote` で書く（→ [architecture.md 3-8](./architecture.md)） | **本番の D1 に直接書く**。Cron はリリースで初めて効く |
| `health.yml`                         | 毎時 7分・37分                                                                          | 本番の `/api/health` を叩き、状態が変わったときだけ Discord「障害」へ（→ [monitoring.md 第6章](./monitoring.md)） | 通知のみ                                            |
| `discord-notify.yml`                 | 他のワークフローから `workflow_call`                                                    | Actions から Discord へ送る部品（→ [monitoring.md 第7章](./monitoring.md)）                                    | 通知のみ                                            |

`odds-update.yml` を起動する Cron は Worker の設定（`wrangler.toml`）なので、**リリースの publish で初めて本番に効く**
（`main` へのマージでは効かない）。時間帯と取得の方針は [architecture.md 3-8](./architecture.md)。
起動には `GITHUB_DISPATCH_TOKEN`（6）、D1 への書き込みには下の `CLOUDFLARE_API_TOKEN` の `D1 : Edit` を使う。

**アプリは `main` にマージしても本番には出ない。** 出るのはリリース publish のときだけ。
`main` は「次に出す候補」であって本番ではない。ステージングには `main` の CI が成功したコミットを反映する。
**出走馬データはリリースを待たない。** マージすればそのまま入る。

順序の約束は1つだけ。**YAML に新しい項目を足す変更は、先にアプリのリリースが要る**
（スクリプトとスキーマの変更を伴うため）。逆は自由で、データ更新はアプリに影響しない。
`deploy.yml` はデータ投入をしない（タグ時点の古い YAML で枠順が巻き戻るため）。

出したくなったら GitHub の Releases でタグを切って publish する。

```bash
gh release create v0.1.0 --generate-notes
```

リリースのタグは `main` の CI を通ったコミットのはずだが、任意のコミットからタグを切ることもできるので、
`deploy.yml` は出す前に `ci.yml` をもう一度呼んで回している（`workflow_call`）。
Cloudflare 側の都合で失敗したときは、Actions から `デプロイ` を `workflow_dispatch` で手動リトライできる（実行するタグを選ぶ）。

**順番が大事。** マイグレーション → デプロイの順にしてある。
逆にすると新しいコードが古いスキーマに当たって壊れる。
この順でも「古いコードが新しいスキーマに当たる」窓が数十秒開くので、
列を消すような破壊的なマイグレーションはそれを承知で流すこと。

### 動かすのに必要な設定

**1. Cloudflare の API トークンを作る**

Cloudflare ダッシュボード > Manage Account > Account API Tokens > Create Token。
My Profile 配下のユーザートークンではなく、**アカウント所有トークン**を作る
（作った人がアカウントを抜けても失効しない）。

| 対象    | 設定                                              | 何のために                                                                       |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Workers | Editor / スコープは Specified Workers → k-note    | `wrangler deploy` の書き込み                                                     |
| Account | `D1 : Edit`                                       | `d1 migrations apply` / `d1 execute`（出走馬データの投入・オッズの更新）         |
| Account | `Workers Scripts : Read`                          | workers.dev のサブドメイン名の読み取り                                           |
| Zone    | `Workers Routes : Write`（ゾーン `uma-memo.com`） | 独自ドメイン（`routes`）の張り付け。`wrangler deploy` は毎回その状態に揃えに行くので、張った後も外さない |

- Account Resources はこのアカウントだけに絞る
- Client IP Address Filtering は**設定しない**。GitHub の runner は IP が動的なので、絞ると壊れる

`Workers: Editor` が `wrangler deploy`（Worker 本体・`[assets]`・シークレット）の
書き込みを担う。バインディングを持つ Worker をデプロイするだけなら、
バインディング先の権限は要らない。`D1 : Edit` を別に付けるのは、
`d1 migrations apply` と `d1 execute` で**D1 を直接叩いている**から。

**`Workers Scripts : Read` は Workers: Editor では代用できない。**
`wrangler deploy` は Worker を上げ終えたあと、結果に出す URL を組み立てるために
`GET /accounts/{id}/workers/subdomain` を読む。これは**アカウント単位**の読み取りで、
Specified Workers に絞ったスコープの外にある。付けずに CI から流すと、
アップロードは成功したのに `Authentication error [code: 10000]` で非ゼロ終了する。
しかもそこで throw して、直後の Worker 単位の `POST .../workers/scripts/k-note/subdomain` に到達しないため、
`wrangler.toml` の `workers_dev` と `preview_urls` を変えても反映されなくなる
（既存の設定が残るので、サイトは動き続けて気づきにくい）。

`workers_dev = false` にすれば読みに行かなくなるが、その POST が `enabled: false` を
送って workers.dev ごと落ちる。workers.dev を止めるときは、これがそのまま止め方になる
（→ [独自ドメインへ移す](#独自ドメインへ移す)）。

**新しい Worker を作るには Workers product スコープの Admin が要る。**
Specified Workers は既にある Worker にしか付けられないので、
まだ一度もデプロイしていないなら、先に手元から `pnpm run deploy` して Worker を作っておくこと。

旧来の `Edit Cloudflare Workers` テンプレート（`Workers Scripts : Edit`）でも動く。
ただし Workers の権限が role ベースに変わり legacy 扱いになった（廃止日は未定）ので、新しく作るなら上の構成にする。

**2. リポジトリに登録する**

Settings > Secrets and variables > Actions。

| 種別     | 名前                         | 値                                                                              |
| -------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`       | 1 で作ったトークン                                                              |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`      | Cloudflare ダッシュボードの Account ID                                          |
| Secret   | `DISCORD_WEBHOOK_URL` ほか   | 通知の Webhook と `HEALTH_CHECK_URL`。中身と差し替えは [monitoring.md 第8章](./monitoring.md) |
| Secret   | `STAGING_GOOGLE_CLIENT_ID` ほか | ステージングのシークレット。無いと `staging.yml` が落ちる。一覧は [staging.md](./staging.md#シークレットはデプロイのたびに渡す) |

**3. `wrangler.toml` の `database_id` が実値であること**（設定済み）

プレースホルダのままだと CI からもデプロイできない。
`pnpm exec wrangler d1 create k-note --location apac` の出力を書く（2 の手順）。
これは機密ではないのでコミットしてよい。

**4. アプリのシークレットは Cloudflare 側に1回だけ**

6 のとおり。`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ADMIN_EMAIL` / `GITHUB_DISPATCH_TOKEN` は
`wrangler secret put` で Cloudflare に入れ、GitHub 側には要らない。例外は `DISCORD_WEBHOOK_URL` で、両方に入れる。
ステージングの分は逆に GitHub 側（`STAGING_` で始まる Secret）に置く。Preview はデプロイのたびにシークレットを渡し直すため（→ [staging.md](./staging.md)）。

**5. Actions に PR を作らせる**

Settings > Actions > General > Workflow permissions で
**「Allow GitHub Actions to create and approve pull requests」を入れる**（既定の「Read repository contents」のままでよい。
`race-data-fetch.yml` は自分の `permissions` で書き込みを要求する）。入れないと、出馬表や結果は取れても PR の作成で落ちる。

Actions の `GITHUB_TOKEN` で作った PR には `ci.yml`・`pr-body.yml` が走らない（GitHub の仕様）。
`race-data-fetch.yml` が自分で `data:check` を通してから PR を作るので、検証は済んでいる。
`main` のルールセットに必須のチェックは無いので、そのままマージできる。

### このリポジトリは public なので

- `pull_request_target` は**使わない**。fork からの PR にシークレットが渡ってしまう
- `pull_request` なら secrets は渡らないので、fork の PR では検証ジョブだけが走る
- deploy はリリース publish 限定なので、PR からも `main` への push からも走らない

## 独自ドメインへ移す

`k-note.<subdomain>.workers.dev` で動いていたものに `uma-memo.com` を当てる手順（構築の 7 の詳細）。
**人が行う。** 順番を守れば、どの時点でも workers.dev 側はそのまま動いている。

1. **ゾーンを Cloudflare に置く。** `uma-memo.com` を Worker と同じアカウントに追加し、
   ネームサーバーを Cloudflare に向ける（Cloudflare Registrar で取ったなら済んでいる）。
   apex に既存の A / AAAA / CNAME レコードがあると custom domain は作れないので消しておく
2. **Google のリダイレクト URI を足す。** Google Cloud Console > APIs & Services > Credentials の
   OAuth クライアントに `https://uma-memo.com/auth/google/callback` を足す。
   既存の workers.dev の URI は消さない。コード側はオリジンから URI を組み立てるので変更は要らない
3. **API トークンに権限を足す。** ゾーン `uma-memo.com` に Zone > `Workers Routes : Write`
   （→ [動かすのに必要な設定](#動かすのに必要な設定) の 1）。CI から初めて routes を張るときに要る
4. **リリースを publish する。** `deploy.yml` の `wrangler deploy` が custom domain を張る。
   手元から張るなら `pnpm run deploy`
5. **確かめる。** `https://uma-memo.com` を開いてログインまで通す。
   Cookie はホストごとなので、workers.dev 側のセッションは引き継がれない（もう一度ログインする）

workers.dev は当面残す。止めるのは独自ドメインで回ると確かめてからで、
`wrangler.toml` の `workers_dev` / `preview_urls` を `false` にし、
Google のリダイレクト URI から workers.dev のものを消す（別の PR で）。

**止めると、workers.dev で発行した共有リンクが全部切れる。** 共有リンクは開いている画面の
オリジンから組み立てる（`ShareControl.svelte`）ので、移行前に配ったリンクも、
workers.dev を残している間にそちらで発行したリンクも `https://k-note.<subdomain>.workers.dev/notes/<id>` になっている。
止める前に、workers.dev への要求を同じパスのまま `https://uma-memo.com` へ 301 で送る仕組みを入れ、
しばらく回してから止める。リダイレクトを入れずに止めるなら、リンクが切れてよいと決めたことを PR に書く。

## バックアップ

D1 の Time Travel で、過去30日間（Workers Paid）の任意の時点に復元できる。
**別途バックアップの仕組みは作らない。** 節目で `pnpm exec wrangler d1 export` を手動実行して手元に置けば十分。
プランと保持日数の関係は [architecture.md 6-1](./architecture.md)。

## 利用者の画面が JS 無しで固まったら

デプロイの切り替わりの間に、新しい JS/CSS のチャンクが 404 で返ることがある。`/_app/immutable/*` は
`Cache-Control: public, immutable, max-age=31536000` が付く経路なので、ブラウザがその 404 を1年抱えて、
画面が JS 無しで固まる。Worker の入口（`src/worker.js`）は、失敗に付いた `immutable` を `no-store` に
差し替えて**抱えるのを防ぐ**（仕組みは [architecture.md 3-5](./architecture.md)）。

ただし、すでに 404 を抱えたブラウザには届かない（キャッシュから返るので Worker に来ない）。
その人には**サイトデータの削除**を頼む（Chrome ならアドレスバーの鍵 → サイトの設定 → データを削除）。
削除すると Cookie も消えるので、もう一度ログインしてもらう。

## アカウントの削除を頼まれたら

プライバシーポリシー第8章で、依頼があれば**アカウントの情報と書いたメモをすべて消す**と約束している。
アプリの「凍結」（`/settings/admin`）は論理削除で行もメモも残るので、これとは別に**人が本番の D1 を直に消す。**

1. Issue で依頼を受けたら、本人確認をする（Issue にメールアドレスを書かせない。依頼者の Google アカウントで
   ログインしたまま `/settings/profile` の表示名を Issue に書いてもらう、など）
2. 対象の `user.id` を引く

   ```bash
   pnpm exec wrangler d1 execute k-note --remote --command "SELECT id, display_name, created_at FROM user WHERE email = '<メールアドレス>'"
   ```

3. 次の順で消す（`note.author_id` が `user` を参照していて、`ON DELETE CASCADE` ではないため、メモを先に消す。
   `session` は `user` と一緒に消える）。`horse` / `race` の `created_by` は admin が作った行にしか入らないが、
   念のため外す

   ```bash
   pnpm exec wrangler d1 execute k-note --remote --command "UPDATE horse SET created_by = NULL WHERE created_by = '<id>'; UPDATE race SET created_by = NULL WHERE created_by = '<id>'; DELETE FROM note WHERE author_id = '<id>'; DELETE FROM user WHERE id = '<id>';"
   ```

4. Issue に削除したことを返して閉じる。同じ Google アカウントでもう一度ログインすると、新しい空のアカウントができる
