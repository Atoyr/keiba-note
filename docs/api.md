# uma-memo の API — ルート・form action・サービス層の約束

このアプリの「外から呼べる口」と「中で呼ぶ口」の一覧と約束。
外の口は SvelteKit のルート（`load`・form actions・`+server.ts`）、中の口はサービス層の関数。

- **読む場面:** ルート・action・`+server.ts` を足す・変えるとき。サービス層の関数を足す・変えるとき。
  ステータスコードやリダイレクト先に迷ったとき
- **ここに無いもの:** ルートの書き方（ファイルの役割、Svelte 側）は [frontend.md](./frontend.md)、
  層の依存の向きと D1 の使い方は [architecture.md](./architecture.md)、
  画面ごとの仕様（何を出すか）は [pages.md](./pages.md)、確かめ方は [testing.md](./testing.md)
- 作成日: 2026-09-23 / 最終更新日: 2026-10-12

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
| ルートの中で念のため | `ctx(locals, platform)`（`src/lib/server/util.ts`） | DB が無い 503 / `user` が無い 401 |
| admin | `ctxAdmin(locals, platform)` | 403 |

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
| `/auth/google/callback` | GET | `code`・`state` | ユーザーを作るか引き、セッションを発行して `302` 元の画面へ | `302 /login?error=invalid_request\|oauth_failed\|unavailable` |
| `/` | GET | — | 未ログインなら紹介ページ（DB に触らない）。ログイン済みなら自分の最近のメモ・今週と過去のレース・推しの出走予定 | — |
| `/privacy` | GET | — | プライバシーポリシー（Google の同意画面に登録する） | — |
| `/terms` | GET | — | 利用規約（同上） | — |
| `/api/health` | GET | — | 死活監視。D1 に `select 1` が通れば `200 {"status":"ok"}`。状態以外は返さない。`Cache-Control: no-store`（→ [monitoring.md 第6章](./monitoring.md)） | `503 {"status":"error"}` |
| `/.well-known/oauth-protected-resource`（と `/mcp` 付き） | GET | — | 保護されたリソースのメタデータ（RFC 9728）。`resource`・`authorization_servers`・`scopes_supported` | — |
| `/.well-known/oauth-authorization-server` | GET | — | 認可サーバーのメタデータ（RFC 8414）。PKCE は S256 だけ・公開クライアントだけ。`client_id_metadata_document_supported: true`（動的登録と Client ID Metadata Document の両方を受ける） | — |
| `/oauth/register` | POST（JSON） | `client_name`・`redirect_uris`（1〜5。https かループバックの http）・`token_endpoint_auth_method`（`none` だけ） | `201` と `client_id`。何の権限も持たない | `400 invalid_redirect_uri` / `invalid_client_metadata`・`413` 本文超過・`429 temporarily_unavailable` 登録上限（`Retry-After: 60`。上限と期限は mcp.md） |
| `/oauth/token` | POST（フォーム） | `grant_type=authorization_code`（`code`・`redirect_uri`・`client_id`・`code_verifier`）か `refresh_token`（`refresh_token`・`client_id`・`scope` で狭められる）。`resource` は自分の `/mcp` だけ | アクセス（1時間）とリフレッシュ（30日・1回きり。応答が届かずに30分の内に同じものを送り直したとき、出したアクセストークンが使われていなければ、届かなかった1組を止めて出し直す）。`no-store` | `400 invalid_grant`（コードの再利用・PKCE・戻り先・期限・別のクライアント）/ `invalid_scope` / `invalid_target` / `unsupported_grant_type`。使い回されたリフレッシュトークン（出したトークンが使われたあと・猶予を過ぎたあと）は連携ごと消す。同時更新の競合は連携を保持して `503 temporarily_unavailable`（`Retry-After: 1`）。送り直しは最初の更新で確定したスコープを引き継ぎ、`scope` を省略しても縮小前に戻らず、異なる `scope` は `invalid_scope`  |
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
| `/races/[id]` | POST `default` | `raceNoteBody`・`body.<entryId>`・`tags.<entryId>`（複数） | ふりかえりを一括保存。`{ savedAt }` | 開催前 400 / 検証 `fail(400)` / 404 |
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
| `/settings/profile` | GET | — | 自分の公開用の名前 | — |
| `/settings/profile` | POST `default` | `publicName`（前後空白除去、30文字以内、空欄可） | 公開名を更新。空欄は匿名 | 検証 `fail(400)` / 保存失敗 `fail(503)`（入力保持・再試行案内） |
| `/races/[id]/summary` | GET | — | 本人の見立て・各馬のメモ・札・印、共有状態、公開名 | 404 |
| `/races/[id]/summary` | POST `?/share` | — | 本人の保存済み予想のコピーを作成・更新し `shareId` を返す（端末共有に使用） | 空の予想・無いレース `fail(400)` / 保存失敗 `fail(503)` |
| `/races/[id]/summary` | POST `?/revoke` | — | 本人の共有コピーを取り消す | 解除の失敗 `fail(503)`（再試行案内） |
| `/settings/shares` | GET | — | 共有中のメモ一覧 | — |
| `/settings/shares` | POST `default` | `noteId`・`visibility`（`private`\|`unlisted`）・`redirect` | 公開範囲を切り替え、`redirect` があれば `303` で戻す | 他人のメモ・無いメモは `fail(404)` |
| `/settings/shares` | POST `default` | `raceId`（メモの操作とは排他） | 本人の予想まとめの共有を取り消す | 検証 `fail(400)` / 解除の失敗 `fail(503)` |
| `/auth/logout` | POST | — | セッションを破棄して `303 /login` | — |
| `/oauth/authorize` | GET | `response_type=code`・`client_id`・`redirect_uri`・`code_challenge`・`code_challenge_method=S256`・`state`・`scope`・`resource` | 同意画面（アプリの名前・戻り先のホスト・スコープ。Client ID Metadata Document なら提供元のホスト）。`client_id` が HTTPS の URL なら、その文書を取りに行く（24時間は保存した内容を使う）。`X-Frame-Options: DENY`・`no-store` | 要求の誤り（クライアント・戻り先・PKCE・`response_type`・`resource`）は**戻り先へ飛ばさず**画面に出す（オープンリダイレクトにしない） |
| `/oauth/authorize` | POST `default` | GET と同じ項目（hidden）・`decision`（`allow`\|`deny`）・`scope_grant`（複数） | `303` 戻り先に `code`・`state`・`iss`。拒否なら `error=access_denied`。同じクライアントへの前のトークンは消す | 要求の誤り `fail(400)`（画面に出す） |
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
| `/mcp` | POST（JSON-RPC 1件） | `initialize`・`ping`・`tools/list`・`tools/call`、通知 | JSON で返す（SSE なし）。通知は `202`。tools/list はトークンのスコープで呼べる tool だけ | トークンなし・無効 `401` / Bearer はあるが DB に届かない `503` / スコープ不足 `403`（`WWW-Authenticate: … error="insufficient_scope", scope="…"`）/ 別オリジンの `Origin` `403` / 壊れた JSON・バッチ・知らない `MCP-Protocol-Version` `400` / 本文が64 KiBを超える `413` / tool の入力の誤り・見つからないは `200` の `isError: true` |
| `/mcp` | GET・DELETE | — | — | `405`（サーバーから流す SSE とセッションは持たない） |

tools（書くのは `save_my_race_preview`・`save_my_race_flow`・`save_my_race_review` だけ。`viewerId` はトークンの持ち主で、入力は余計な項目を受けない `strictObject`）:

| tool | スコープ | 入力 | 返すもの |
| --- | --- | --- | --- |
| `search_races` | `races:read` | `q`・`year`・`limit`（1〜50） | レース（新しい順）。`notes:read` もあれば `myNoteCount`（自分のメモの件数） |
| `get_race` | `races:read` | `raceId` | レースの条件・出走馬（馬番・騎手・着順）・オッズとその時点 |
| `get_horse` | `races:read` | `horseId`・`limit`（1〜100） | 馬のプロフィール（性・生年・生年月日・調教師・父母・母父）と出走歴 |
| `get_my_race_notes` | `notes:read` | `raceId` | そのレースの自分の見立て・ふりかえり・各馬のメモ・印・札・展開 |
| `get_my_horse_notes` | `notes:read` | `horseId` | その馬の自分のメモ |
| `list_my_recent_notes` | `notes:read` | `limit`（1〜50） | 自分の最近のメモ |
| `save_my_race_preview` | `notes:write` | `raceId`・`raceNote.body`・`entries`（〜40。`entryId` と、`body`・`mark`（null で外す）・`tags` のうち書き換えるもの） | 書いた結果（`raceNote` は `saved`・`cleared`・`unchanged`、馬ごとは `saved`・`cleared`。見立ての `cleared` は本文を空にしたことで、展開があれば行は残る）。本文は返さない。`body` は追記でなく置き換え。省いた馬・項目・展開はそのまま。出走馬でない `entryId`・空の入力は何も書かずに `isError` |
| `save_my_race_flow` | `notes:write` | `raceId`・`pace`（スロー・ミドル・ハイ。null で外す）・`start`・`corner4`・`finish`（それぞれ `spots`（`entryId`・`x` 0〜9・`y` 0〜3。〜40）と `memo`（200文字まで）のうち書き換えるもの） | 書いた結果（`flow` は `saved`・`cleared`）。中身は返さない。渡した局面の渡した項目だけを書き換え、`spots` は局面の隊列を丸ごと置き換え（`[]` で空）。省いた局面・項目と、見立ての本文・印・出走前メモはそのまま。すべて空になると展開は消える。同じ馬・同じマスの重なり、出走馬でない `entryId`、出走馬が0頭のレース、空の入力は何も書かずに `isError` |
| `save_my_race_review` | `reviews:write` | `raceId`・`raceNote.body`・`entries`（〜40。`entryId` と、`body`・`tags` のうち書き換えるもの。印は運ばない） | 書いた結果（`raceNote` は `saved`・`cleared`・`unchanged`、馬ごとは `saved`・`cleared`）。本文は返さない。`body` は追記でなく置き換え。省いた馬・項目はそのまま。予想には触れない。開催前のレース・出走馬でない `entryId`・空の入力は何も書かずに `isError` |

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
- **戻り先を入力から受けるときは `safeRedirect` を通す。** `//evil.com` のような外への飛び先を弾く
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
| 本人だけのもの（推しの馬・騎手のまとめ `jockey_note`・重賞の傾向のメモ `graded_race_note`） | **`viewerId` を必須で受ける** | `user_id = :viewer`（誰が何を推しているか・書いているかを他人に見せない） |
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
| `services/results-fetch.ts` | 結果の取得を頼む対象（`listResultsFetchTargets`。当日・JRA の10場・R 1〜12・出走馬あり）。結果は YAML の PR で入る |
| `services/notes.ts` | レース・馬のメモ、最近のメモ、同条件のレース、共有ページのメモの読み。ふりかえり・予想・近況メモの保存、削除、公開範囲 |
| `services/race-shares.ts` | 予想まとめの共有コピーの読み・作成・取り消し |
| `services/profile.ts` | 公開名の読み書き |
| `services/favorites.ts` | 推しの馬の読み書きと、推しの出走予定 |
| `services/jockeys.ts` | 騎手の一覧・騎乗・まとめ、レースの出走馬の騎手のまとめ。まとめの保存 |
| `services/graded-races.ts` | 重賞の一覧・年ごとのタイムライン、傾向のメモの読み書き（マスタの読みは `viewerId` を取らない） |
| `services/mcp-usage.ts` | MCP の週ごとの利用量の数え・上限・リセット |
| `auth/session.ts` | セッションの発行・検証・破棄、ユーザーの作成と検索 |
| `auth/oauth.ts` | OAuth のクライアント・コード・トークン・連携。`listGrants`・`revokeGrant` は `userId` を WHERE に入れる（他人の連携は `false`） |

関数を足したら、役割が表と合っているかを見る。
