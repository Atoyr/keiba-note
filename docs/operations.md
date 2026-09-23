# k-note 運用手順 — Cloudflare の構築とデプロイ

README から運用の手順だけを切り出したもの。日々の開発では読まなくてよい。
アプリの全体像は [architecture.md 第4章](./architecture.md)（デプロイ構成）と第8章（運用）。

- 作成日: 2026-09-23 — README の「Cloudflare に構築する」「デプロイ（GitHub Actions）」を移設

---

## Cloudflare に構築する

**構築済み。** D1 `k-note`（APAC）と Worker `k-note` は作成され、
`wrangler.toml` の `database_id` にも実値が入っている。
以下は**作り直すときの手順**として残してある。

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

ここまでで動く。以降は GitHub でリリースを publish すれば Actions が
マイグレーション → デプロイまで回す。レースデータは `main` へのマージで入る（下記）。

### 確認に使うコマンド

```bash
pnpm exec wrangler whoami              # ログインできているか
pnpm exec wrangler d1 list             # D1 ができたか
pnpm exec wrangler d1 info k-note      # 場所（apac か）とサイズ
pnpm exec wrangler secret list         # 入れたシークレットの名前（値は出ない）
pnpm exec wrangler deploy --dry-run    # 上げずにビルドだけ試す
pnpm exec wrangler tail                # 本番のログを流す
```

## デプロイ（GitHub Actions）

ワークフローは3本。**アプリとレースデータは別系統で出る。**

```
PR / main への push        → ci.yml          検証（data:check / check / lint / test:unit）＋ E2E
リリース publish           → deploy.yml      検証 ＋ E2E ＋ マイグレーション → デプロイ
main の data/races/** 変更 → data-import.yml 検証 → レースデータ投入
```

**アプリは `main` にマージしても本番には出ない。** 出るのはリリース publish のときだけ。
**レースデータはリリースを待たない。** マージすればそのまま入る。

分けてあるのは周期が違うから。出馬表は開催前に入っている必要があり、
1レースにつき 予定 → 枠確定 → 結果 の3回更新される。
これをリリースの単位に縛ると毎週リリースを切ることになり、版番号が意味を失う。

順序の約束は1つだけ。**YAML に新しい項目を足す変更は、先にアプリのリリースが要る**
（スクリプトとスキーマの変更を伴うため）。逆は自由で、データ更新はアプリに影響しない。
`deploy.yml` はデータ投入をしない（タグ時点の古い YAML で枠順が巻き戻るため）。

`main` は「次に出す候補」であって本番ではない。
出したくなったら GitHub の Releases でタグを切って publish する。

```bash
gh release create v0.1.0 --generate-notes
```

リリースのタグは main の CI を通った commit のはずだが、
任意の commit からタグを切ることもできるので、`deploy.yml` は
出す前に `ci.yml` をもう一度呼んで回している（`workflow_call`）。

Cloudflare 側の都合で失敗したときは、Actions から `デプロイ` を
`workflow_dispatch` で手動リトライできる（実行するタグを選ぶ）。

**順番が大事。** マイグレーション → デプロイの順にしてある。
逆にすると新しいコードが古いスキーマに当たって壊れる。
この順でも「古いコードが新しいスキーマに当たる」窓が数十秒開くので、
列を消すような破壊的なマイグレーションはそれを承知で流すこと。

### 動かすのに必要な設定

**1. Cloudflare の API トークンを作る**

Cloudflare ダッシュボード > Manage Account > Account API Tokens > Create Token。
My Profile 配下のユーザートークンではなく、**アカウント所有トークン**を作る
（作った人がアカウントを抜けても失効しない）。

| 対象    | 設定                                           | 何のために                             |
| ------- | ---------------------------------------------- | -------------------------------------- |
| Workers | Editor / スコープは Specified Workers → k-note | `wrangler deploy` の書き込み           |
| Account | `D1 : Edit`                                    | `d1 migrations apply` / `d1 execute`   |
| Account | `Workers Scripts : Read`                       | workers.dev のサブドメイン名の読み取り |

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
**アップロードは成功したのにコマンドが `Authentication error [code: 10000]` で
非ゼロ終了する**（v0.1.0 のリリースで踏んだ）。

厄介なのは、そこで throw して**直後の
`POST /accounts/{id}/workers/scripts/k-note/subdomain` に到達しないこと**。
workers.dev を実際に有効化しているのはこちらの Worker 単位の API なので、
`wrangler.toml` の `workers_dev` と `preview_urls` を変えても反映されなくなる。
既存の設定が残るぶんサイトは動き続けるので、気づきにくい。

`workers_dev = false` にすれば読みに行かなくなるが、その POST が `enabled: false` を
送って workers.dev ごと落ちる。独自ドメインが無いうちは取れない手。

**新しい Worker を作るには Workers product スコープの Admin が要る。**
Specified Workers は既にある Worker にしか付けられないので、
まだ一度もデプロイしていないなら、先に手元から `pnpm run deploy` して Worker を作っておくこと。

独自ドメインを当てるときは、対象ゾーンに Zone > `Workers Routes : Write` を足す。
ルートを張った後の通常のデプロイには要らない（ルート自体を変えるときだけ必要）。

旧来の `Edit Cloudflare Workers` テンプレート（`Workers Scripts : Edit`）でも動く。
2026-09-15 に Workers の権限が role ベースに変わり legacy 扱いになった（廃止日は未定）ので、
新しく作るなら上の構成にする。

なお、上の subdomain の件が新しい構成でだけ顕在化するのは、legacy の
`Workers Scripts : Edit` が**アカウント単位で、Worker を絞れない**ため。
Specified Workers で絞れるようになった代わりに、アカウント単位の読み取りが
別途要るようになった、という関係にある。

**2. リポジトリに登録する**

Settings > Secrets and variables > Actions。

| 種別   | 名前                    | 値                                     |
| ------ | ----------------------- | -------------------------------------- |
| Secret | `CLOUDFLARE_API_TOKEN`  | 1 で作ったトークン                     |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの Account ID |

以前あった `DEPLOY_ENABLED` というリポジトリ変数の栓は廃止した。
デプロイの入口がリリース publish に変わって、
「うっかり出る」経路が無くなったので栓が要らなくなった。

**3. `wrangler.toml` の `database_id` が実値であること**（設定済み）

プレースホルダのままだと CI からもデプロイできない。
`pnpm exec wrangler d1 create k-note --location apac` の出力を書く。
これは機密ではないのでコミットしてよい。

**4. アプリのシークレットは Cloudflare 側に1回だけ**

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ADMIN_EMAIL` は
`pnpm exec wrangler secret put` で Cloudflare に入れる。**GitHub 側には要らない。**
毎回のデプロイで入れ直す必要もない。

### このリポジトリは public なので

- `pull_request_target` は**使わない**。fork からの PR にシークレットが渡ってしまう
- `pull_request` なら secrets は渡らないので、fork の PR では検証ジョブだけが走る
- deploy はリリース publish 限定なので、PR からも main への push からも走らない

