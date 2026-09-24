# uma-memo の監視と通知

本番で何かが壊れたときに、人が気づけるようにする仕組み。Worker のログ、Discord への通知、
GitHub Actions の結果の通知、外からの死活監視。

- **読む場面:** ログを足す・エラーの扱いを変えるとき。通知が来た・来ないを調べるとき。
  Webhook を差し替えるとき
- **ここに無いもの:** Cloudflare とシークレットの構築手順は [operations.md](./operations.md)、
  層と依存の向きは [architecture.md](./architecture.md)
- 作成日: 2026-09-23
- 更新日: 2026-09-23 — Discord のチャンネルを「障害」と「デプロイ」の2つに分けた（→ 第7章・第8章）
- 更新日: 2026-09-24 — Cron（オッズの取得）の event を足した（→ 第3章）

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
| `odds.fetch` | info / warn / error | 下の表 | `lib/server/odds/update.ts` | 1レースぶんのオッズを取りに行った（成否どちらも）。`provider`・`raceId`・`externalRaceId`・`startedAt`・`finishedAt`・`success`・`horseCount`・`errorType` を載せる |
| `odds.cron` | info | しない | `lib/server/odds/scheduled.ts` | Cron の1回ぶんを終えた。対象のレースがあった回だけ出す（件数の内訳） |
| `odds.cron.failed` | error | する | 同上 | 対象のレースを選ぶところで落ちた（D1 に届かないなど） |

`odds.fetch` の重さは `errorType`（`OddsError` の種類）で決める。**通知するのは人が手を入れる必要があるものだけ**で、
一時的に届かなかった1回では知らせない（30分後の回で取れる）。Cron には request id が無いので、
`requestId` は `cron-odds-<起動時刻>` にしている。

| errorType | level | 通知 | 意味 |
| --- | --- | --- | --- |
| （成功） | info | しない | 保存した |
| `not-available` | info | しない | 発売前（予想オッズしか出ていない）。失敗ではない |
| `network` / `http` | warn | しない | 届かなかった・5xx（1回再試行したうえで）/ それ以外の HTTP の失敗 |
| `rate-limited` | warn | する | 取得元に制限された。その回の残りのレースは取りに行かない |
| `unsupported-ref` | warn | する | レースの `ref` を取得元が読めない（YAML の書き間違い） |
| `parse` | error | する | 応答の形が想定と違う。**取得元の構造が変わった疑い**で、直すまで毎回落ちる |
| `invalid` | error | する | 値がおかしいので保存しなかった |
| `unknown` | error | する | 上のどれでもない（D1 への保存の失敗など） |

連投の抑制の鍵は `odds.fetch:<errorType>`。同じ種類の失敗が複数のレースで続いても5分に1件にまとまる。
リクエストと同じく、Cron の1回で送る通知は1件まで（先に起きたほう）。

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
（通知が黙って消えないように。Actions の実行に注記が残る）。

## 8. 設定する値

| どこ | 名前 | 種別 | 中身 |
| --- | --- | --- | --- |
| Cloudflare（Worker `k-note`） | `DISCORD_WEBHOOK_URL` | シークレット | Webhook の URL（`pnpm exec wrangler secret put DISCORD_WEBHOOK_URL`） |
| Cloudflare（Preview `staging`） | `DISCORD_WEBHOOK_URL` | シークレット | 任意。入れれば staging の ERROR も届く（`Environment: staging`）。別のチャンネルにしてもよい |
| GitHub（Settings > Secrets and variables > Actions） | `DISCORD_WEBHOOK_URL` | Secret | 「障害」のチャンネルの Webhook。Cloudflare と同じもの |
| 同上 | `DISCORD_DEPLOY_WEBHOOK_URL` | Secret | 「デプロイ」のチャンネルの Webhook。無ければ「障害」に送る |
| 同上 | `HEALTH_CHECK_URL` | Variable | `https://uma-memo.com/api/health`。`/api/health` の入ったリリースを出してから入れる |
| `wrangler.toml` | `APP_ENV` | vars | `production`（`[previews.vars]` は `staging`）。シークレットではない |

**「障害」の Webhook を差し替えるときは Cloudflare と GitHub の両方を入れ直す。** URL が漏れたら、Discord の
チャンネル設定から Webhook を消して作り直す（URL を知っている人は誰でも書き込める）。

## 9. これから

必要になったときに検討する（今は入れない）。Tail Workers・OpenTelemetry・Sentry・Grafana・Axiom などのログ基盤、
SLO / SLI、レイテンシの監視、重大な障害でのメンション。
