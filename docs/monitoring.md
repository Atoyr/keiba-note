# uma-memo の監視と通知

本番で何かが壊れたときに、人が気づけるようにする仕組み。Worker のログ、Discord への通知、
GitHub Actions の結果の通知、外からの死活監視。

- **読む場面:** ログを足す・エラーの扱いを変えるとき。通知が来た・来ないを調べるとき。
  Webhook を差し替えるとき
- **ここに無いもの:** Cloudflare とシークレットの構築手順は [operations.md](./operations.md)、
  層と依存の向きは [architecture.md](./architecture.md)
- 作成日: 2026-09-23
- 更新日: 2026-09-24 — Workers Paid に上げたので、Worker の上限と課金の見張りを足した（→ 第9章）。
  デプロイの Webhook を Variable に入れて障害のチャンネルに落ちていたのを、Actions が見つけて知らせるようにした（→ 第7章・第8章）

---

## 1. 全体像

```
Worker（hooks.server.ts が1リクエストに1つ monitor を作る）
 ├─ 構造化ログ ─────────────→ Workers Logs（Observability。全部ここに残る）
 └─ ERROR（と通知すると決めた WARN）→ 連投の抑制 → Discord「障害」

GitHub Actions（discord-notify.yml）
 ├─ health.yml（30分ごとに /api/health）落ちた・戻ったときだけ → Discord「障害」
 ├─ main の CI の失敗 ──────────────┐
 ├─ 本番デプロイの成功・失敗 ───────┼→ Discord「デプロイ」
 └─ 本番へのレースデータ投入の失敗 ─┘

Cloudflare（ダッシュボードで設定。コードには無い → 第9章）
 ├─ 使用量の通知（Workers・D1 が決めた量を超えた）→ Discord「障害」
 └─ Budget alert（従量課金の見込みが決めた額を超えた）→ メール
```

外部の監視サービスは足していない。Cloudflare Observability（`wrangler.toml` の `[observability]`）と
Discord と GitHub Actions で組む。

## 2. ログ

`src/lib/server/monitoring/log.ts` の形で出す。Workers Logs はオブジェクトを項目ごとに検索できる。

| 項目 | 中身 |
| --- | --- |
| `level` | `info` / `warn` / `error` |
| `event` | `d1.query.failed` のような、ドットでつないだ英小文字。検索と通知の抑制に使う |
| `message` | 日本語の短い説明 |
| `requestId` | Cloudflare が振る `cf-ray`（ローカルは UUID）。同じリクエストの行と突き合わせる |
| `durationMs` | かかった時間（あるときだけ） |
| `error` | `describeError` で要約したエラー（`name`・`message`・`causes`・`stack`） |
| そのほか | `route`（`/races/[id]` の形）・`method`・`status`・`sql` など |

**出さないもの:** パスワード・トークン・Cookie・Authorization ヘッダ・Webhook の URL・メモの本文・
メールアドレス。Drizzle のエラーはバインドした値をメッセージに載せる（`params: ...`）ので、
`describeError` がそこを `[redacted]` に置き換える。SQL は `?` のままの文だけを出す。
パス（`/races/01J8X...`）ではなくルートの形を出し、クエリ文字列（検索語）も出さない。

Workers Logs は、こちらが出すログとは別に**呼び出しごとのログ（リクエストの URL を含む）を自動で残す。**
そこにクエリ文字列が残ると、`/auth/google/callback` の `code`・`state`（OAuth の認可コード）と
`/horses` の `q`（検索語）が載るので、`wrangler.toml` の `[observability] redact_query_string = true` で落としている。
クエリ文字列に値を載せるルートを足しても、ログには出ない。

### ログを足すとき

ルートからは `locals.monitor.log({ level, event, message, ... })`。
サービス層は monitor を知らない（SvelteKit にも HTTP にも縛られないため）。サービス層の失敗は
投げたままにし、ルートで扱うか、扱わなければ `handleError` が拾う。
`console.error` を直接呼ばない（形が揃わず、通知にも乗らない）。

## 3. level と通知

| level | Workers Logs | Discord |
| --- | --- | --- |
| `info` | 残す | 送らない |
| `warn` | 残す | **`notify: true` を付けたものだけ。** 対応が要るもの（放っておくと壊れる）に限る |
| `error` | 残す | 送る |

### 今ある event

| event | level | 通知 | どこで | いつ |
| --- | --- | --- | --- | --- |
| `request.unhandled` | error | する | `hooks.server.ts` の `handleError` | 想定外の例外で 500 以上になった。404（無いパス）は bot の走査で溢れるので送らない |
| `d1.query.failed` | error | する | `createDb` に渡した observer | D1 のクエリが失敗した |
| `d1.query.constraint` | warn | しない | 同上 | UNIQUE / CHECK 違反。ルートが 409 に振り替える想定で、利用者の操作で普通に起きる |
| `d1.query.slow` | warn | しない | 同上 | 1クエリ（`batch` は1往復）が `SLOW_QUERY_MS`（500ms）以上かかった |
| `auth.google.token_exchange.failed` | warn / error | error だけ | `/auth/google/callback` | `invalid_grant`（戻るボタン・二度押し）は warn。それ以外は全員がログインできなくなる類なので error |
| `monitoring.discord.failed` | error | — | `discord.ts` | 通知そのものが送れなかった（ログにだけ出る） |
| `monitoring.test` | error | する | `/dev/notify-test` | 開発サーバーからの疎通確認（→ 第6章） |

**`SLOW_QUERY_MS` は仮置き。** Workers Logs で `d1.query.slow` の件数と `durationMs` を見て決め直す。
対応が要る遅さが分かったら、そのときに `notify: true` を付ける。

### D1 の見張り方

`createDb(env, observe)` が D1 の binding を包み（`src/lib/server/db/instrument.ts`）、
クエリごとに SQL の文・時間・失敗を observer（`locals.monitor.onQuery`）に渡す。
`observe` を省略可能にしていないのは、渡し忘れた経路だけ監視から漏れるのを防ぐため。
包むのは測って渡すところまでで、どれをログにするかは `monitoring/monitor.ts` の `classifyQuery` が決める。

## 4. Discord への通知

- **Webhook を叩くのは2か所だけ。** Worker は `src/lib/server/monitoring/discord.ts`、
  Actions は `.github/workflows/discord-notify.yml`。各所の catch から直接 fetch しない
- Webhook の URL はシークレットに置く（→ 第8章）。コード・`wrangler.toml`・ログに出さない
- 送信は `waitUntil` に載せる。応答は待たない。**送信に失敗しても投げない**（本来のリクエストを壊さない）
- 埋め込み（embed）で送り、赤が ERROR・黄が WARNING・緑が成功。`allowed_mentions` を空にして、
  エラー文に `@everyone` が混ざっても誰にもメンションしない
- `Content-Type: application/json; charset=utf-8` で送る（手動テストで日本語が化けたことがある）
- `Environment` 欄は `wrangler.toml` の `APP_ENV`（本番 `production`・Preview `staging`）。開発サーバーは `local`

## 5. 通知の連投を抑える

障害のときに「1エラー = 1通知」だと、Discord が埋まって肝心の最初の1件が流れる。今は2段で抑えている。

1. **1リクエストで1件まで。** D1 が落ちると `d1.query.failed` のあとに同じ原因の `request.unhandled` が
   続く。先に来た（原因に近い）ほうだけを送る。ログには両方残る
2. **同じ鍵は5分に1件まで**（`AlertThrottle`）。鍵は既定で `level:event`、`request.unhandled` は
   ルートごと。抑えた件数は、次に送る通知の `Suppressed` 欄に出る

2 の状態は **isolate の中にしか無い**（モジュールスコープの `Map`。持つのは event 名と時刻と件数だけ）。
Workers は拠点ごと・負荷ごとに isolate が分かれるので、障害時でも「isolate の数 × 5分に1件」までは届く。
数人が使う規模では isolate は少なく、これで足りる見込み。

足りなくなったら、`AlertThrottle.take(key)` の形を保ったまま中身を差し替える。

| やりたいこと | 置き場 |
| --- | --- |
| isolate をまたいで確実に抑える・「5分で10回」のような回数の条件 | Durable Objects（強整合のカウンタ） |
| 数分おきにまとめて1通にする | Durable Objects のアラーム、か Cron Trigger で Workers Logs を集計 |
| ERROR と WARN で窓を変える | `createMonitor` の `throttle` を level ごとに分ける |

## 6. 死活監視 — `/api/health`

`GET /api/health` は Worker が応答し、D1 に `select 1` が通れば `200 {"status":"ok"}`、
通らなければ `503 {"status":"error"}` を返す。ログイン不要（`PUBLIC_PATHS`）なので、
**状態以外は何も返さない。** 理由は Workers Logs の `d1.query.failed` に残る。

外から叩くのは `.github/workflows/health.yml`（毎時 7分・37分）。Worker は自分が応答していないことを
自分では知らせられないので、Cron Trigger ではなく外に置いた（リポジトリが public なので Actions の分数もかからない）。

- 3回まで20秒おきに試し、3回とも駄目なら「落ちた」
- **通知するのは状態が変わったときだけ。** 落ちたら赤、戻ったら緑。落ちている間ずっと30分ごとに届くことはない。
  「戻った」も送るのは、状態が変わったときにしか送らない以上、それが無いと復旧したかが分からないため
- 前回の状態は、確認が最後まで済んだ直近の実行の「結果」ジョブで見る（落ちている間は「結果」を失敗にしてある）。
  実行全体の結果で見ると、GitHub 側の揺れや取り消しを本番の異常と読み違える。前回が分からないときは、
  落ちていれば知らせ、正常なら何も送らない
- 叩く先はリポジトリ変数 `HEALTH_CHECK_URL`（`https://uma-memo.com/api/health`）。未設定なら何もしない
- GitHub は public リポジトリで60日間 push が無いと schedule を止める。止まったら Actions の画面から有効に戻す

### 疎通確認 — `/dev/notify-test`

Worker → Discord の経路を手元で確かめる口。`dev` ガードで本番ビルドでは 404 なので、外から通知は起こせない。

```bash
# .dev.vars に DISCORD_WEBHOOK_URL を入れてから
pnpm run dev
curl -X POST http://localhost:5173/dev/notify-test
```

`{"requestId":"...","webhook":"set"}` が返り、Discord に「🔴 ERROR / monitoring.test」が届けば通っている。
確かめ終えたら `.dev.vars` から `DISCORD_WEBHOOK_URL` を消す（開発中のエラーが本番のチャンネルに届く）。
E2E は `--var DISCORD_WEBHOOK_URL:` で空にしているので、残していても E2E からは届かない。

## 7. GitHub Actions からの通知

| ワークフロー | 送るとき | 色 | チャンネル |
| --- | --- | --- | --- |
| `ci.yml` | **main への push で**落ちたとき（PR の失敗は書いた人が見ているので送らない） | 赤 | デプロイ |
| `deploy.yml` | 本番デプロイが成功したとき・落ちたとき（取り消しは送らない） | 緑 / 赤 | デプロイ |
| `data-import.yml` | 本番へのレースデータ投入が落ちたとき（成功は開催のたびに流れるので送らない） | 赤 | デプロイ |
| `health.yml` | `/api/health` が落ちたとき・戻ったとき | 赤 / 緑 | 障害 |

どれも `discord-notify.yml` を `workflow_call` で呼び、`channel`（`alerts` / `deploy`）で送り先を選ぶ。
ステージングへの反映（`staging.yml`）は送っていない。

**チャンネルは2つに分けている。** 「障害」は本番が壊れている知らせ（Worker の ERROR と死活監視）で、
見たらすぐ動くもの。「デプロイ」は CI/CD の結果で、自分が起こした操作の返事。混ぜると、
デプロイの成功通知に障害の通知が埋もれる。「デプロイ」の Webhook が未設定なら「障害」に送る
（通知が黙って消えないように）。そのときは、届いた通知の下端（footer）に「デプロイ用のチャンネルに送れず、
ここに送っています」と理由を書き、Actions の実行にも警告を残す。

**`DISCORD_DEPLOY_WEBHOOK_URL` を Secret ではなく Variable に入れると、未設定と同じになる**（ワークフローは
`secrets.*` しか読まない）。2026-09-24 に実際にこれで「障害」にデプロイの通知が流れていた。
Variable に入っていることは Actions が見つけ、footer の理由に書く。

## 8. 設定する値

| どこ | 名前 | 種別 | 中身 |
| --- | --- | --- | --- |
| Cloudflare（Worker `k-note`） | `DISCORD_WEBHOOK_URL` | シークレット | Webhook の URL（`pnpm exec wrangler secret put DISCORD_WEBHOOK_URL`） |
| Cloudflare（Preview `staging`） | `DISCORD_WEBHOOK_URL` | シークレット | 任意。入れれば staging の ERROR も届く（`Environment: staging`）。別のチャンネルにしてもよい |
| GitHub（Settings > Secrets and variables > Actions） | `DISCORD_WEBHOOK_URL` | Secret | 「障害」のチャンネルの Webhook。Cloudflare と同じもの |
| 同上 | `DISCORD_DEPLOY_WEBHOOK_URL` | Secret | 「デプロイ」のチャンネルの Webhook。無ければ「障害」に送る。**Variables のタブに入れない** |
| 同上 | `HEALTH_CHECK_URL` | Variable | `https://uma-memo.com/api/health`。`/api/health` の入ったリリースを出してから入れる |
| `wrangler.toml` | `APP_ENV` | vars | `production`（`[previews.vars]` は `staging`）。シークレットではない |
| Cloudflare（Notifications > Destinations） | Webhook | — | 「障害」のチャンネルの Webhook。使用量の通知の送り先（→ 第9章） |

**「障害」の Webhook を差し替えるときは Cloudflare（Worker のシークレットと Notifications の送り先）と
GitHub の両方を入れ直す。** URL が漏れたら、Discord の
チャンネル設定から Webhook を消して作り直す（URL を知っている人は誰でも書き込める）。
Variable に入れた URL は、リポジトリに書き込める人なら誰でも画面や API で読める。漏れたものとして扱う。

## 9. 上限と課金の見張り

2026-09-24 に Workers Paid（$5/月）に上げた。Free では上限を超えると**エラーになるだけ**だったが、
Paid では超えた分が**課金されて動き続ける**。暴走しても気づかず請求だけが来る、を防ぐのがこの章。

### 9-1. Worker の上限 — `wrangler.toml` の `[limits]`

| 項目 | Paid の既定 | ここで置いた値 | 考え方 |
| --- | --- | --- | --- |
| `cpu_ms`（1呼び出しの CPU 時間） | 30,000 ms | **100 ms** | Free の 10ms で動いていた。SSR は数ms。10倍の余裕 |
| `subrequests`（1呼び出しの fetch・D1 などの呼び出し数） | 10,000 | **50** | Free の頃と同じ。D1 クエリは10以内の約束（[architecture.md 7-1](./architecture.md)） |

上限は、無限ループや N+1 の暴走を**請求ではなく障害として**表に出すためのもの。Preview（ステージング）にも同じ値が効く。
ローカル（`pnpm run dev`・E2E）では効かない。

**超えたときの見え方が2つで違う。**

- **サブリクエスト数**は、超えた呼び出しが例外になる。`d1.query.failed` か `request.unhandled` として Discord「障害」に届く
- **CPU 時間**は、Worker がその場で止められるので `handleError` も走らず、**Discord には何も届かない。**
  Workers Logs で呼び出しの結果（outcome）が `exceededCpu` になっているかで見る。利用者には Cloudflare のエラー画面（1102）が出る。
  頻発すれば `/api/health` か使用量の通知で気づく

足りなくなったら（正当な処理で超えるようになったら）、値を上げる前に、何が重いかを Workers Logs で確かめる。

### 9-2. 使用量と金額の見張り — Cloudflare のダッシュボード

コードでは設定できないので、人がダッシュボードで設定する。**どれも止める仕組みではなく、知らせるだけ。**

| 何を | どこで | 送り先 | 値の目安 |
| --- | --- | --- | --- |
| Budget alert（従量課金の見込み額） | Manage Account > Billing > Billable Usage > Create budget alert | メール（これしか選べない） | **$1。** 普段の従量課金は $0 なので、1ドルでも見込まれたら異常 |
| 使用量の通知（Workers のリクエスト数） | Notifications > Add > Usage Based Billing | Discord「障害」 | 100万/月（普段は1万/月ほど。含まれる枠は1,000万） |
| 使用量の通知（D1 rows read） | 同上 | 同上 | 1億/月（普段は100万/月ほど。枠は250億） |
| 使用量の通知（D1 rows written） | 同上 | 同上 | 100万/月（普段は数万/月。枠は5,000万） |

- 使用量の通知の閾値は、**含まれる枠よりずっと下、普段の量よりずっと上**に置く。枠に届く前、つまり
  お金がかかる前に「いつもと桁が違う」ことを知らせたい。普段の量は [architecture.md 6-1](./architecture.md) の試算で、
  実測はダッシュボードの Worker / D1 のメトリクスで見て、ずれていたら直す
- D1 の使用量は**アカウント単位でステージングと合算**される。ステージングへのデータ投入の暴走（2026-09-24 の事故）も、ここで見える
- Discord への送り先は Notifications > Destinations > Webhooks で「障害」の Webhook を登録する（Cloudflare が Discord の URL を解釈する）
- 通知の種類や閾値の単位はダッシュボードの表示に従う。この表と違ったら、この表を直す

### 9-3. 入れていないもの

- **リクエスト数の制限（レート制限）。** 利用者ごと・IP ごとに保存や `/auth` を絞る仕組み。Workers の Rate Limiting
  binding か、ゾーンの WAF のレート制限ルールで入れられる。WAF で止めたリクエストは Worker を起動しないので課金もされない。
  今の規模では、9-2 の通知で気づけば足りるとして入れていない
- **CPU 超過を Discord に送ること。** Worker の外から見るしかない（Tail Worker か、GraphQL Analytics API を Actions から定期に読む）。
  9-1 のとおり今は Workers Logs で見る

## 10. これから

必要になったときに検討する（今は入れない）。Tail Workers・OpenTelemetry・Sentry・Grafana・Axiom などのログ基盤、
SLO / SLI、レイテンシの監視、重大な障害でのメンション。
