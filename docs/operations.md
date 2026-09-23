# uma-memo 運用手順 — Cloudflare の構築とデプロイ

README から運用の手順だけを切り出したもの。日々の開発では読まなくてよい。
アプリの全体像は [architecture.md 第4章](./architecture.md)（デプロイ構成）と第8章（運用）。

- 作成日: 2026-09-23 — README の「Cloudflare に構築する」「デプロイ（GitHub Actions）」を移設
- 更新日: 2026-09-23 — アプリ名を uma-memo に変え、独自ドメイン `uma-memo.com` を当てる手順を足した（→ 名前について / 独自ドメインへ移す）

---

## 名前について

アプリ名は **uma-memo**（旧名 k-note）。変えたのは画面に出る名前と URL（`https://uma-memo.com`）だけで、
次のものは**旧名のまま**にしてある。

| もの | 名前 | 変えない理由 |
| --- | --- | --- |
| GitHub のリポジトリ | `keiba-note` | clone 済みの remote や Actions の設定を巻き込むため |
| Worker（`wrangler.toml` の `name`） | `k-note` | 変えると別の Worker ができ、シークレットも入れ直しになる |
| D1（`database_name`） | `k-note` | 名前は変えられない。作り直すとデータの移し替えになる |
| Google Cloud のプロジェクト・OAuth クライアント | 旧名のまま | リダイレクト URI を足すだけで足りる |

コマンドや設定に出てくる `k-note` は、この表のどれかを指している。**揃えようとして書き換えないこと。**

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
**承認済みのリダイレクト URI に3つ登録する。**

```
http://localhost:5173/auth/google/callback
https://uma-memo.com/auth/google/callback
https://k-note.<subdomain>.workers.dev/auth/google/callback
```

同じ画面の **OAuth 同意画面**（Google Auth Platform > ブランディング / 対象）を埋めて、
公開ステータスを「本番環境」にする。「テスト」のままだと、テストユーザーに登録した
Google アカウント（100 件まで）しかログインできない。

| 項目 | 値 |
| --- | --- |
| アプリ名 | `uma-memo` |
| ユーザーサポートメール・デベロッパーの連絡先 | 運営者のアドレス（画面には出ない。Google からの連絡用） |
| アプリのホームページ | `https://uma-memo.com/`（未ログインだと紹介ページ。ポリシーへのリンクがある） |
| アプリのプライバシー ポリシー | `https://uma-memo.com/privacy` |
| アプリの利用規約 | `https://uma-memo.com/terms` |
| 承認済みドメイン | `uma-memo.com` |
| ユーザーの種類 | 外部 |
| スコープ | `openid`・`.../auth/userinfo.email`・`.../auth/userinfo.profile` |

要求するスコープは機密でないものだけなので、本番環境にするのにスコープの審査は要らない。
ロゴを載せるとブランドの確認が要るので、載せない。

ポリシーと規約の本文は `src/routes/privacy/`・`src/routes/terms/` にある。取る情報や
使う外部サービスを変えたら、本文と最終改定日も直す。

### アカウントの削除を頼まれたら

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

### 6. シークレットを入れる

3つとも、実行すると値の入力を求められる。**デプロイし直す必要はない。**

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ADMIN_EMAIL
```

`ADMIN_EMAIL` と一致する Google アカウントでログインした人だけが `admin` になる。

### 7. 独自ドメインを当てる

`wrangler.toml` の `routes` に `uma-memo.com` を `custom_domain = true` で書いてある。
ゾーン `uma-memo.com` が同じ Cloudflare アカウントにあれば、デプロイ時に
DNS レコードと証明書を Cloudflare が作る（→ 下の「独自ドメインへ移す」）。

### 8. レースデータを投入する

```bash
pnpm run data:import:remote
```

ここまでで動く。以降は GitHub でリリースを publish すれば Actions が
マイグレーション → デプロイまで回す。レースデータは `main` へのマージで入る（下記）。

### 独自ドメインへ移す

`k-note.<subdomain>.workers.dev` で動いていたものに `uma-memo.com` を当てる手順。
**人が行う。** 順番を守れば、どの時点でも workers.dev 側はそのまま動いている。

1. **ゾーンを Cloudflare に置く。** `uma-memo.com` を Worker と同じアカウントに追加し、
   ネームサーバーを Cloudflare に向ける（Cloudflare Registrar で取ったなら済んでいる）。
   apex に既存の A / AAAA / CNAME レコードがあると custom domain は作れないので消しておく
2. **Google のリダイレクト URI を足す。** Google Cloud Console > APIs & Services > Credentials の
   OAuth クライアントに `https://uma-memo.com/auth/google/callback` を足す。
   既存の workers.dev の URI は消さない。コード側はオリジンから URI を組み立てるので変更は要らない
3. **API トークンに権限を足す。** ゾーン `uma-memo.com` に Zone > `Workers Routes : Write`
   （→ 下の「動かすのに必要な設定」）。CI から初めて routes を張るときに要る
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
| Zone    | `Workers Routes : Write`（ゾーン `uma-memo.com`） | 独自ドメイン（`routes`）の張り付け |

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
送って workers.dev ごと落ちる。`uma-memo.com` に移し終えて workers.dev を止めるときには、これがそのまま止め方になる。

**新しい Worker を作るには Workers product スコープの Admin が要る。**
Specified Workers は既にある Worker にしか付けられないので、
まだ一度もデプロイしていないなら、先に手元から `pnpm run deploy` して Worker を作っておくこと。

**表の最後の行（Zone）は** `uma-memo.com` を当てるときに足した。`wrangler.toml` に `routes` を書いている限り、
`wrangler deploy` は毎回その状態に揃えに行くので、張った後のデプロイでも外さないこと。

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

