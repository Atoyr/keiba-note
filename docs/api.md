# uma-memo の API — ルート・form action・サービス層の約束

このアプリの「外から呼べる口」と「中で呼ぶ口」の一覧と約束。
外の口は SvelteKit のルート（`load`・form actions・`+server.ts`）、中の口はサービス層の関数。

- 作成日: 2026-09-23 / 最終更新日: 2026-11-12
- **読む場面:** ルート・action・`+server.ts` を足す・変えるとき。サービス層の関数を足す・変えるとき。
  ステータスコードやリダイレクト先に迷ったとき
- **ここに無いもの:** ルートの書き方（ファイルの役割、Svelte 側）は [frontend.md](./frontend.md)、
  層の依存の向きと D1 の使い方は [architecture.md](./architecture.md)、
  画面ごとの仕様（何を出すか）は [pages.md](./pages.md)、MCP・OAuth の口の詳細と tools は [mcp.md](./mcp.md)、確かめ方は [testing.md](./testing.md)

---

## 1. 形 — 専用の REST API は作らない

SvelteKit の `load` + form actions で完結させる。

予想画面の WebMCP tools はブラウザ内の読み取りと未保存フォーム更新だけで、HTTP の口は増やさない。
保存は既存 action のまま。tool の仕様は [mcp.md 第7章](./mcp.md)。

例外は **MCP の口 `/mcp`**（Claude・ChatGPT から読む。許せば予想とふりかえりを書く）と、その認可の口（`/.well-known/*`・`/oauth/*`）。
画面の代わりではなく AI のクライアント向けで、読むのが中心。書けるのは本人が `notes:write` を許したときの予想と、`reviews:write` を許したときのふりかえりだけで、
form action と同じサービス関数（`savePreviewNotes`・`saveRaceReview`）を呼ぶ。中身はサービス層を呼ぶだけ（→ [mcp.md](./mcp.md)）。
ほかに、同意画面（`/oauth/authorize`）の GET の `load` だけは D1 に書く。Client ID Metadata Document を取ってきた内容を
`oauth_client` に24時間保存するキャッシュで、本人の権限は何も変えない（許可は form action の `POST`）。

- 読み: `+page.server.ts` の `load` がサービス層を呼ぶ
- 書き: form actions。JavaScript が無効でも動く（プログレッシブエンハンスメント）
- `+server.ts` は、フォームでも画面でもない HTTP（OAuth のリダイレクト、ログアウト、死活監視、MCP の `/mcp`・`/.well-known/oauth-*`・`/oauth/register`）にだけ使う

画面遷移ごとに API を叩く SPA にすると、リクエストが増え、実装も二重になる（→ [architecture.md 5-3](./architecture.md)）。

オッズもこの形に従う。`GET /api/races/:id/odds` のような口は作らず、予想画面の `load` が
`getRaceOdds` で D1 から読んで渡す。ブラウザは取得元（netkeiba）を呼ばない。
`/api/v1/*` はまだ無い。将来モバイルクライアントなどが要るようになったら足す。そのときのために
業務ロジックは `src/lib/server/services/` に置き、ルートからは薄く呼ぶだけにしておく（→ 第5章）。

## 2. 認証と、誰が呼べるか

認証は `src/hooks.server.ts` だけが判断する（→ [architecture.md 第0章](./architecture.md)）。

| 誰が | 仕組み | 通らなかったとき |
| --- | --- | --- |
| 誰でも | `src/hooks.server.ts` の `PUBLIC_PATHS` にあるパスと、その下。**`/` だけは完全一致** | — |
| ログインした人 | hooks がセッション Cookie を検証して `locals.user` を載せる | `302 /login?redirect=<元のパス>` |
| MCP クライアント（`/mcp` だけ） | hooks が `Authorization: Bearer` のアクセストークンを検証し、`locals.user`（許した本人）と `locals.oauthScopes` を載せる。**Cookie は見ない** | `401` と `WWW-Authenticate: Bearer resource_metadata=…`（ログインへ飛ばさない）。Bearer はあるが DB に届かないときは `503 temporarily_unavailable`（401 にするとクライアントがトークンを捨てる） |
| ルートの中で念のため | `ctx(locals)`（`src/lib/server/util.ts`） | DB が無い 503 / `user` が無い 401 |
| admin | `ctxAdmin(locals)` | 403 |

- **ログイン不要のパスを増やすのは `PUBLIC_PATHS` だけ。** ルートの中で個別に通さない
- `/` は未ログインでも開き、紹介ページを出す。`load` は `locals.user` が無ければ DB に触らず
  `{ landing: true }` だけを返す。**ここで何か引くと、そのまま誰にでも見える**
- **Bearer が効くのは `/mcp` だけ。** ほかのパスは `Authorization` を読まない。`/mcp` は Cookie を読まない
- `/oauth/token` は SvelteKit に来る前に `src/worker.js` が受ける（SvelteKit の CSRF の検査が Origin の無いフォームの
  POST を落とすため。→ [mcp.md](./mcp.md)）。だから `PUBLIC_PATHS` に無い
- `/notes/` は共有ページのための公開パス。**ログインが要る画面を `/notes/` の下に作らない**
  （共有の取り消しが `/settings/shares` にあるのはこのため）
- 本番ビルドでは SvelteKit が POST の `Origin` を検証する（CSRF）。`vite dev` では効かないので、
  form POST は E2E で確かめる（→ [testing.md](./testing.md)）

## 3. ルートの一覧

`?/名前` は名前付き action、`default` は `?/` 無しで POST する action。

### 3-1. 公開

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/login` | GET | `redirect`・`error` | ログイン済みなら `302` で `redirect` へ | — |
| `/auth/google` | GET | `redirect` | `302` Google の認可画面（state と PKCE を Cookie に10分） | `302 /login?error=unavailable` |
| `/auth/google/callback` | GET | `code`・`state` | ユーザーを作るか引き、セッションを発行して `302` 元の画面へ | `302 /login?error=invalid_request\|oauth_failed\|unavailable\|suspended\|account_conflict`（`suspended` は凍結したユーザー、`account_conflict` は別の Google アカウントが同じ email で登録済み。どちらもセッションは作らない） |
| `/` | GET | — | 未ログインなら紹介ページ（DB に触らない）。ログイン済みなら自分の最近のメモ・今週と過去のレース・推しの出走予定 | — |
| `/privacy` | GET | — | プライバシーポリシー（Google の同意画面に登録する） | — |
| `/terms` | GET | — | 利用規約（同上） | — |
| `/api/health` | GET | — | 死活監視。D1 に `select 1` が通れば `200 {"status":"ok"}`。状態以外は返さない。`Cache-Control: no-store`（→ [monitoring.md 第6章](./monitoring.md)） | `503 {"status":"error"}` |
| `/.well-known/oauth-protected-resource`（と `/mcp` 付き） | GET | — | 保護されたリソースのメタデータ（RFC 9728）（詳細は [mcp.md 1-1](./mcp.md)） | — |
| `/.well-known/oauth-authorization-server` | GET | — | 認可サーバーのメタデータ（RFC 8414）（詳細は [mcp.md 1-1](./mcp.md)） | — |
| `/oauth/register` | POST（JSON） | `client_name`・`redirect_uris`・`token_endpoint_auth_method` | `201` と `client_id`。何の権限も持たない（詳細は [mcp.md 1-1](./mcp.md)） | `400` / `413` / `429`（登録上限） |
| `/oauth/token` | POST（フォーム） | `grant_type=authorization_code` か `refresh_token` | アクセスとリフレッシュのトークン。`src/worker.js` が SvelteKit より先に受ける（詳細は [mcp.md 1-1](./mcp.md)） | `400 invalid_grant` ほか / `503`（同時更新の競合） |
| `/notes/[id]` | GET | — | unlisted のメモ1件。`X-Robots-Tag: noindex, nofollow`・`Referrer-Policy: no-referrer`・`Cache-Control: private, no-store` | **404**（private でも存在しなくても同じ） |
| `/shared/races/[id]` | GET | — | 予想まとめの共有用コピー1件・公開名・ログインしているか（`signedIn`。未ログインの人にだけ末尾の案内を出すため）。`og:title`・`og:description`・`og:image`・`twitter:card` を持つ（組み立ては `utils/share-card.ts`）。`noindex`・`no-referrer`・`no-store`。ルートレイアウトは `user: null` を返し、本人の閲覧でもアカウント情報を送らない | 無い・取り消し済み・著者凍結済みは **404** |
| `/shared/races/[id]/og.png` | GET（`+server.ts`） | — | SNS のプレビュー用に、同じコピーと公開名から印の表を描いた 1200×630 の PNG。`?v=<更新時刻>-<公開名のハッシュ>` で絶対 URL を組む | 404 は共有ページと同じ。`vite dev` では描けず 503（→ [architecture.md 3-7](./architecture.md)） |

### 3-2. ログインした人

ログインが要るルート。予想まとめの共有ページ（`/shared/races/[id]`）は公開なので 3-1 にある。

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/help/mcp` | GET | — | MCP（Claude・ChatGPT のプラグイン）の登録の案内と接続先 URL。DB に触らない | — |
| `/help/webmcp` | GET | — | WebMCPの使い方。ブラウザの対応確認・準備・予想画面での下書き反映と保存。toolsは登録しない | — |
| `/this-week` | GET | `w`（週のずれ。整数） | その週の重賞 | 整数でなければ今週 |
| `/races` | GET | `year`・`grade`（複数）・`q`・`offset` | レース一覧を `offset` 件目から100件と、条件に当たる総数。画面は下端で `offset` を付けてこの `load` を `preloadData` で呼び、続きを足す | 未知の値は捨てる。`offset` が数字でなければ 0 |
| `/races/[id]` | GET | — | ふりかえり画面。重賞なら自分の重賞の傾向と、このレースを除いた重賞のタイムラインも返す（`graded: { key, trend, timeline }`。`trend` は傾向が無ければ `null`。重賞でなければ `graded` が `null`）。出走馬の行に自分の騎手のまとめ（`jockeySummary: { body, tags }`。無ければ `null`）。**開催前なら `302 /races/[id]/preview`** | 404 |
| `/races/[id]` | POST `?/save` | `raceNoteBody`・`body.<entryId>`・`tags.<entryId>`（複数） | ふりかえりを一括保存。`{ savedAt }` | 開催前 400 / 検証 `fail(400)` / 404 |
| `/races/[id]` | POST `?/quick` | `entryId`・`body` | クイック入力の自動保存。1頭の本文だけを保存し、札は残す（`saveEntryReviewBody`）。`{ quickSaved }` | 開催前 400 / 出走馬でない・検証 `fail(400)` / 404 |
| `/races/[id]/preview` | GET | — | 出馬表・馬柱・過去のメモ・オッズ（D1 にある最新の値と時点）。重賞なら自分の重賞の傾向と重賞のタイムライン（`graded`。形は `/races/[id]` と同じ）。出走馬の行に自分の騎手のまとめ（`jockeySummary`。形は `/races/[id]` と同じ） | 404 |
| `/races/[id]/preview` | POST `default` | `raceNoteBody`・`racePace`・`flowSpots.<局面>`（JSON）・`flowMemo.<局面>`・`body.<entryId>`・`tags.<entryId>`・`mark.<entryId>`（局面は `start`・`corner4`・`finish`） | 見立て（展開の予想を含む）と予想印を一括保存。盤面の馬はこのレースの出走馬に絞る | 検証 `fail(400)` / 404 |
| `/horses` | GET | `q`・`offset` | 馬一覧を `offset` 件目から100頭（続きの読み方は `/races` と同じ） | `offset` が数字でなければ 0 |
| `/horses/[id]` | GET | — | プロフィールとタイムライン・自分の推しか | 404 |
| `/horses/[id]` | POST `?/favorite` | `favorite`（`1` で推しにする・`0` で外す） | 自分の推しを切り替え、`{ favorite }` を返す。何度送っても同じ状態になる | 検証 `fail(400)` / 無い馬 404 |
| `/horses/[id]` | POST `?/addNote` | `body`・`tags`（複数）・`occurredAt` | 近況メモを足す | 検証 `fail(400)` / 404 |
| `/horses/[id]` | POST `?/deleteNote` | `noteId` | 自分のメモを消す | 他人のメモ・無いメモは `fail(403)` |
| `/graded-races` | GET | — | 今年の重賞（G1〜G3）の一覧。月ごとに、メモのある年の数と傾向の有無 | — |
| `/graded-races/[name]` | GET | — | 自分の傾向のメモと、年ごとのタイムライン（予想の見立て・ペース・印、ふりかえり）。`name` は重賞の鍵（エンコードして渡す。別名でも開ける） | G1〜G3 のレースが無い名前は 404 |
| `/graded-races/[name]` | POST `?/saveTrend` | `body` | 自分の傾向のメモを上書き。空なら消す。`{ trend: 'saved' \| 'cleared' }` | 検証 `fail(400)` / G1〜G3 のレースが無い名前は 404 |
| `/jockeys` | GET | `q`・`tag` | 騎手の一覧（騎乗の多い順）と、自分が使っている札 | 選択肢に無い `tag` は捨てる |
| `/jockeys/[name]` | GET | `notes`（`1` でメモのある騎乗だけ） | 自分のまとめと、騎乗のタイムライン（騎乗ごとに自分の出走前・ふりかえりメモ）。`name` は騎手名（エンコードして渡す） | 騎乗の無い名前は 404 |
| `/jockeys/[name]` | POST `?/saveSummary` | `body`・`tags`（複数） | 自分のまとめを上書き。本文も札も空なら消す。`{ summary: 'saved' \| 'cleared' }` | 検証 `fail(400)` / 騎乗の無い名前 404 |
| `/settings/insight-words` | GET | — | 自分のクイック入力の言葉（登録順）と上限 | — |
| `/settings/insight-words` | POST `?/add` | `word`（NFKC に寄せて前後の空白を除き 1〜20 字）、おすすめから送るときは `source=defaults` | 言葉を登録（30 個まで）。`{ added }` | 検証 `fail(400)` / 登録済み `fail(409)` / 上限 `fail(400)` / 保存失敗 `fail(503)`（入力保持。`source=defaults` のときは `{ message, source }` で返し、`word` は返さない） |
| `/settings/insight-words` | POST `?/addDefaults` | なし（中身は `DEFAULT_INSIGHT_WORDS`） | おすすめの言葉のうち未登録のものを、上限までの残りだけ登録。`{ addedDefaults, limited }`。ふりかえり画面のクイック入力の言葉0個からも送る | 1つも足せず上限 `fail(400)` / 保存失敗 `fail(503)` |
| `/settings/insight-words` | POST `?/remove` | `word` | 登録を消す（メモに入れた文と、以前に残した気づきは消えない）。`{ removed }` | 検証 `fail(400)` / 失敗 `fail(503)` |
| `/settings/profile` | GET | — | 自分の公開用の名前 | — |
| `/settings/profile` | POST `default` | `publicName`（前後空白除去、30文字以内、空欄可） | 公開名を更新。空欄は匿名 | 検証 `fail(400)` / 保存失敗 `fail(503)`（入力保持・再試行案内） |
| `/races/[id]/summary` | GET | — | 本人の見立て・各馬のメモ・札・印、共有状態、公開名 | 404 |
| `/races/[id]/summary` | POST `?/share` | — | 本人の保存済み予想のコピーを作成・更新し `shareId` を返す（端末共有に使用） | 空の予想・無いレース `fail(400)` / 保存失敗 `fail(503)` |
| `/races/[id]/summary` | POST `?/revoke` | — | 本人の共有コピーを取り消す | 解除の失敗 `fail(503)`（再試行案内） |
| `/settings/shares` | GET | — | 共有中のメモ一覧 | — |
| `/settings/shares` | POST `default` | `noteId`・`visibility`（`private`\|`unlisted`）・`redirect` | 公開範囲を切り替え、`redirect` があれば `303` で戻す | 他人のメモ・無いメモは `fail(404)` |
| `/settings/shares` | POST `default` | `raceId`（メモの操作とは排他） | 本人の予想まとめの共有を取り消す | 検証 `fail(400)` / 解除の失敗 `fail(503)` |
| `/auth/logout` | POST | — | セッションを破棄して `303 /login` | — |
| `/oauth/authorize` | GET | `response_type=code`・`client_id`・`redirect_uri`・`code_challenge` ほか | 同意画面（詳細は [mcp.md 1-1](./mcp.md)） | 要求の誤りは**戻り先へ飛ばさず**画面に出す（オープンリダイレクトにしない） |
| `/oauth/authorize` | POST `default` | GET と同じ項目（hidden）・`decision`・`scope_grant`（複数） | `303` 戻り先に `code`・`state`・`iss`（詳細は [mcp.md 1-1](./mcp.md)） | 要求の誤り `fail(400)`（画面に出す） |
| `/settings/connections` | GET | — | MCP の接続先 URL と、本人が許可したアプリ（名前・Client ID Metadata Document なら提供元のホスト・戻り先のホスト・スコープ・日付）、今週の利用量（読み取り・書き込みの %・次に 0 に戻る時刻） | — |
| `/settings/connections` | POST `?/revoke` | `grantId` | 本人の連携を解除（コードとトークンも消える） | 検証 `fail(400)` / 他人の連携・無い連携 `fail(404)` |

### 3-3. admin だけ（`ctxAdmin`）

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/horses/[id]` | POST `?/saveProfile` | `nameKana`・`sex`・`birthYear`・`birthDate`（生年月日。生年が空なら年を補い、年が違えば `fail(400)`）・`damSire`（母父）・`trainer`・`trainingCenter`（所属）・`sire` など（**馬名は含まない**） | プロフィールを更新 | 性別・所属が選択肢に無い・生年月日が実在しない・生年と生年月日の年が違う `fail(400)` / 同じ名前・同じ生年の馬がいる `fail(409)` / 403 |
| `/races/new` | GET / POST `default` | レースの項目（`raceSchema`） | `303 /races/[id]/entries` | 検証 `fail(400)` / 同じ日付・場・R `fail(409)` / 403 |
| `/races/[id]/entries` | GET / POST `default` | `rowCount`・`horseName.<i>`・`bracket.<i>`・`horseNumber.<i>` ほか | `303 /races/[id]` | 検証 `fail(400)` / 同じ馬名が2行 `fail(400)` / 馬番か馬の重複（UNIQUE） `fail(409)` / 403 |
| `/settings/admin` | GET / POST `?/freeze` | `userId` | ユーザーを凍結し、セッションと AI との連携（`oauth_grant`。コードとトークンも CASCADE）を全部消す | 自分自身は `fail(400)` / 403 |
| `/settings/admin` | POST `?/resetMcpUsage` | `userId` | そのユーザーの今週の MCP の利用量（読み取り・書き込み）を 0 に戻す（`mcp_usage` の行を消す）。行が無くても成功 | 検証 `fail(400)` / 403 |
| `/settings/admin` | POST `?/fetchEntries` | `raceId` | そのレースの出走馬の取得を GitHub Actions に頼み、`{ requested }` を返す（D1 には書かない。→ [architecture.md 3-9](./architecture.md)） | 無いレース `fail(404)` / 引けないレース（レース番号なし・race_id が無く当週でもない。`entriesFetchBlocker`）`fail(400)` / トークン未設定 `fail(503)` / GitHub が受け付けない `fail(502)` / 403 |

### 3-4. 開発サーバーだけ

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/dev/mock-user` | POST | `as`（`admin`\|`user`）・`redirect` | モックのユーザーに切り替えて `303` | 本番ビルドでは 404 |
| `/dev/notify-test` | POST | — | Discord へ ERROR を1件送る（疎通確認。→ [monitoring.md 第6章](./monitoring.md)） | 本番ビルドでは 404 |

### 3-5. MCP クライアント（Bearer）

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/mcp` | POST（JSON-RPC 1件） | `initialize`・`ping`・`tools/list`・`tools/call`、通知 | JSON で返す（SSE なし）（詳細は [mcp.md 1-1](./mcp.md)） | `401`（トークンなし・無効）/ `403`（スコープ不足）/ `503` ほか |
| `/mcp` | GET・DELETE | — | — | `405`（サーバーから流す SSE とセッションは持たない） |

tools とスコープ・入力・返すものは [mcp.md 3-2](./mcp.md) が正。書く tool は `save_my_race_preview`・`save_my_race_flow`・`save_my_race_review` だけで、`viewerId` はトークンの持ち主。

### 3-6. HTTP でない口 — Cron Trigger

起動する時刻は `wrangler.toml` の `crons` が正（取得の段ごとの意味は [architecture.md 3-8 / 3-9](./architecture.md)）。

| 起動 | 入口 | すること |
| --- | --- | --- |
| 候補・出走馬・枠順の発表に合わせた曜日の時刻 | `src/worker.js` の `scheduled` → `lib/server/race-data/scheduled.ts` | 馬番がまだ無い重賞の出走馬の取得を GitHub Actions に頼む |
| 毎日の夕方 | `src/worker.js` の `scheduled` → `lib/server/race-data/scheduled.ts` の `runResultsCron` | 当日の出走馬がある JRA のレースの結果の取得を GitHub Actions に頼む |
| オッズを取りに行く時間帯の30分おき | `src/worker.js` の `scheduled` → `lib/server/odds/scheduled.ts` | 取りに行く時間帯に入った重賞があれば、GitHub Actions（`odds-update.yml`）を起動する |

ルートと同じく、監視の口と D1 クライアントは入口（`scheduled.ts`）が1回ごとに作る。
ログインの概念は無い（誰の操作でもない）。Worker の Cron は起動の合図を出すだけで、
オッズを `race_odds` に書くのは Actions（→ [architecture.md 3-8](./architecture.md)）。

## 4. action を書くときの約束

- **入力は Valibot で型を付けてから使う。** スキーマは `src/lib/schemas/`。失敗は
  `fail(400, { message })` で返す。`message` は画面にそのまま出る日本語にする
- **行の構成は DB を正とする。** `body.<entryId>` の `entryId` はフォームから拾わず、
  DB から引いた出走馬の一覧を回して読む（他のレースの行に書き込ませないため）
- **書いたあとの遷移は `303`。** 同じ画面に留まるときはリダイレクトせず、値を返して `form` で受ける
- **戻り先を入力から受けるときは `safeRedirect` を通す。** URL として解析して判定し（前方一致の継ぎ足しではない）、`//evil.com`・途中のタブや改行（`/\t/evil.com`）・`\`・畳んで `//` になるもの（`/..//evil.com`）を弾く。返すのは正規化後のパスで、日本語は百分率符号化になる
- **他人のものと、無いものを区別して返さない。** 共有ページは 404 に揃え、「その id は在る」を漏らさない
- **操作の可否はルートで、データの絞り込みはサービス層で。** admin かどうか、開催前かどうかは
  ルートが見る。「誰のメモか」はサービス層の SQL が見る（→ [architecture.md 3-6](./architecture.md)）
- D1 の制約違反は `src/lib/server/db/errors.ts` の `isUniqueViolation` / `isCheckViolation` で見分け、
  UNIQUE は `fail(409)` に振り替える
- DB は `ctx()` から取る。D1 クライアントの作り方は [architecture.md 3-1](./architecture.md)、
  1リクエストのクエリ数（10以内。読みは JOIN か `Promise.all`、書きは `batch()`）は [architecture.md 7-1](./architecture.md)
- ログは `console.*` ではなく `locals.monitor.log()` で出す（→ [monitoring.md 第2章](./monitoring.md)）

## 5. サービス層の関数の約束

`src/lib/server/services/`（業務ロジック）と `src/lib/server/auth/`（セッション・OAuth）。
ルートからも、将来の `/api/v1/*` からも、テストからも同じ形で呼べることが目的。

### 形

```ts
export async function listRaceNotes(db: Db, raceId: string, viewerId: string): Promise<NoteView[]>
```

- **第1引数は `db: Db`。** リクエストごとに作ったものを受け取る。関数の中で作らない
- **SvelteKit を import しない。** `RequestEvent`・`error()`・`redirect()` を使わず、値か `null` か `boolean` を返す。
  HTTP のステータスに直すのはルートの仕事
- 入力は Valibot を通したあとの型（`RaceReviewFormInput` など）で受ける
- 複数の書き込みは `db.batch()` で1往復・1トランザクションにする

### 誰のデータか

規則とその理由は [architecture.md 第0章 / 3-6](./architecture.md)。ここは領域ごとの引数と WHERE の表。

| 読むもの | 引数 | WHERE |
| --- | --- | --- |
| メモ | **`viewerId` を必須で受ける**（省略可能にしない・既定値を与えない） | `author_id = :viewer` |
| 共有ページのメモ（`getSharedNote` だけ） | `noteId` | `id = :id AND visibility = 'unlisted'` |
| 馬・レース・出走馬（マスタ）・オッズ | 絞らない | 全員に共通 |
| 本人だけのもの（推しの馬・騎手のまとめ `jockey_note`・重賞の傾向のメモ `graded_race_note`・気づきの言葉 `insight_word`・レース直後の気づき `race_entry_insight`） | **`viewerId` を必須で受ける** | `user_id = :viewer`（誰が何を推しているか・書いているかを他人に見せない） |
| マスタの一覧にメモの件数を添えるもの（`listHorses`・`listRacesBetween` など） | `viewerId` を必須で受ける | 件数は viewer のメモだけで数える（他人が何か書いていることを漏らさない） |

- メモを書く・消す関数は `authorId` を受け、WHERE に入れる。他人のメモに当たったときは
  例外にせず `false` を返す（`deleteNote`・`setNoteVisibility`）
- マスタの書き込み（`createRace`・`saveEntries`・`updateHorseProfile`）はサービス層では権限を見ない。
  呼ぶルートが `ctxAdmin` を通す

### 今ある関数

ファイルごとの役割だけを書く。関数の一覧は各ファイルの `export` が正（ここに書き写すと足し忘れる）。

| ファイル | 役割 |
| --- | --- |
| `services/horses.ts` | 馬の一覧・詳細、馬の作成・プロフィール更新 |
| `services/races.ts` | レースの一覧・件数・年・週の重賞、出走馬（予想用を含む）、過去走・馬の出走歴。レースの作成、出走馬の作成・更新 |
| `services/odds.ts` | オッズの読み、取得対象のレースの選び。書くのは GitHub Actions（`scripts/odds/store.ts` の SQL。→ [architecture.md 3-8](./architecture.md)） |
| `services/entries-fetch.ts` | 出走馬の取得を頼む対象と、頼めないレースの判定（`entriesFetchBlocker`。D1 を読まない）。出馬表は YAML の PR で入る |
| `services/results-fetch.ts` | 結果の取得を頼む対象（`listResultsFetchTargets`。当日・JRA の10場・R 1〜12・出走馬あり）と、通過順の取り直しの対象・諦めたレース（`listPassingRefetchTargets`・`listPassingGaveUpRaces`。→ [architecture.md 3-9](./architecture.md)）。結果は YAML の PR で入る |
| `services/notes.ts` | レース・馬のメモ、最近のメモ、同条件のレース、共有ページのメモの読み。ふりかえり・予想・近況メモの保存、削除、公開範囲 |
| `services/race-shares.ts` | 予想まとめの共有コピーの読み・作成・取り消し |
| `services/profile.ts` | 公開名の読み書き |
| `services/favorites.ts` | 推しの馬の読み書きと、推しの出走予定 |
| `services/insights.ts` | 気づきの言葉の登録・まとめて登録（`addInsightWords`）・削除、以前に残した気づきを読む関数（ふりかえり画面・予想画面・馬の画面。`viewerId` 必須。気づきは新しくは作らない） |
| `services/jockeys.ts` | 騎手の一覧・騎乗・まとめ、レースの出走馬の騎手のまとめ。まとめの保存 |
| `services/graded-races.ts` | 重賞の一覧・年ごとのタイムライン、傾向のメモの読み書き（マスタの読みは `viewerId` を取らない） |
| `services/users.ts` | admin 画面が使うユーザーの一覧（`listUsersForAdmin`）と凍結（`freezeUser`。セッション・連携の削除と共有メモの private 化を1つの batch で）。権限は見ない（呼ぶルートが `ctxAdmin` と「自分自身は不可」を見る） |
| `services/mcp-usage.ts` | MCP の週ごとの利用量の数え・上限・リセット |
| `auth/session.ts` | セッションの発行・検証・破棄、ユーザーの作成と検索 |
| `auth/oauth.ts` | OAuth のクライアント・コード・トークン・連携。`listGrants`・`revokeGrant` は `userId` を WHERE に入れる（他人の連携は `false`） |

関数を足したら、役割が表と合っているかを見る。
