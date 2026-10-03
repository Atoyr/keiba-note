# uma-memo の API — ルート・form action・サービス層の約束

このアプリの「外から呼べる口」と「中で呼ぶ口」の一覧と約束。
外の口は SvelteKit のルート（`load`・form actions・`+server.ts`）、中の口はサービス層の関数。

- **読む場面:** ルート・action・`+server.ts` を足す・変えるとき。サービス層の関数を足す・変えるとき。
  ステータスコードやリダイレクト先に迷ったとき
- **ここに無いもの:** ルートの書き方（ファイルの役割、Svelte 側）は [frontend.md](./frontend.md)、
  層の依存の向きと D1 の使い方は [architecture.md](./architecture.md)、
  画面ごとの仕様（何を出すか）は [product.md 第6章](./product.md)、確かめ方は [testing.md](./testing.md)
- 作成日: 2026-09-23 — product.md 第3章「API の形」を移し、ルートの一覧を実物から起こした
- 更新日: 2026-10-03 — MCP の口（`/mcp`）と OAuth 2.1 の口（`/.well-known/*`・`/oauth/*`）、
  `/settings/connections`、`auth/oauth.ts` を足した（→ 第1章 / 第2章 / 第3章 / 第5章）
- 更新日: 2026-09-28 — 予想まとめの共有ページに OGP を付け、SNS のプレビュー用の画像 `/shared/races/[id]/og.png` を足した（→ 第3章）
- 更新日: 2026-09-27 — `/races` と `/horses` に `offset` を足し、一覧を100件ずつ返すようにした。`countRaces` を足した（→ 第3章 / 第5章）
- 更新日: 2026-09-27 — 騎手の一覧と画面（`/jockeys`・`/jockeys/[name]` の `?/saveSummary`）と `services/jockeys.ts` を足した（→ 第3章 / 第5章）
- 更新日: 2026-09-27 — 推しの馬（`/horses/[id]` の `?/favorite` と `services/favorites.ts`）を足した（→ 第3章 / 第5章）
- 更新日: 2026-09-25 — 管理画面の `?/fetchEntries` と、出走馬の取得を頼む Cron と `services/entries-fetch.ts` を足した（→ 第1章 / 第3章 / 第5章）
- 更新日: 2026-09-24 — オッズを予想画面の `load` で渡すことにし、Cron Trigger の口と `services/odds.ts` を足した（→ 第1章 / 第3章 / 第5章）

---

## 1. 形 — 専用の REST API は作らない

SvelteKit の `load` + form actions で完結させる。

予想画面の WebMCP tools はブラウザ内の読み取りと未保存フォーム更新だけで、HTTP の口は増やさない。
保存は既存 action のまま。tool の仕様は [frontend.md 第8章](./frontend.md#8-webmcp-で予想の下書きを受ける)。

例外は **MCP の口 `/mcp`**（Claude・ChatGPT から読む）と、その認可の口（`/.well-known/*`・`/oauth/*`）。
画面の代わりではなく AI のクライアント向けで、読むだけ。中身はサービス層を呼ぶだけ（→ [architecture.md 3-10](./architecture.md)）。

- 読み: `+page.server.ts` の `load` がサービス層を呼ぶ
- 書き: form actions。JavaScript が無効でも動く（プログレッシブエンハンスメント）
- `+server.ts` は、フォームでも画面でもない HTTP（OAuth のリダイレクト、ログアウト、死活監視、MCP の `/mcp`・`/.well-known/oauth-*`・`/oauth/register`）にだけ使う

画面遷移ごとに API を叩く SPA にすると、リクエストが増え、実装も二重になる（→ [architecture.md 5-3](./architecture.md)）。

オッズもこの形に従う。`GET /api/races/:id/odds` のような口は作らず、予想画面の `load` が
`getRaceOdds` で D1 から読んで渡す。ブラウザは取得元（netkeiba）を呼ばない。
将来モバイルクライアントなどが要るようになったら `/api/v1/*` を足す。そのときのために
業務ロジックは `src/lib/server/services/` に置き、ルートからは薄く呼ぶだけにしておく（→ 第5章）。

## 2. 認証と、誰が呼べるか

認証は `src/hooks.server.ts` だけが判断する（→ [product.md 第4章](./product.md)）。

| 誰が | 仕組み | 通らなかったとき |
| --- | --- | --- |
| 誰でも | `PUBLIC_PATHS`（`/`・`/login`・`/auth/`・`/notes/`・`/shared/races/`・`/privacy`・`/terms`・`/api/health`・`/.well-known/oauth-protected-resource`・`/.well-known/oauth-authorization-server`・`/oauth/register`）のパスと、その下。**`/` だけは完全一致** | — |
| ログインした人 | hooks がセッション Cookie を検証して `locals.user` を載せる | `302 /login?redirect=<元のパス>` |
| MCP クライアント（`/mcp` だけ） | hooks が `Authorization: Bearer` のアクセストークンを検証し、`locals.user`（許した本人）と `locals.oauthScopes` を載せる。**Cookie は見ない** | `401` と `WWW-Authenticate: Bearer resource_metadata=…`（ログインへ飛ばさない）。Bearer はあるが DB に届かないときは `503 temporarily_unavailable`（401 にするとクライアントがトークンを捨てる） |
| ルートの中で念のため | `ctx(locals, platform)`（`src/lib/server/util.ts`） | DB が無い 503 / `user` が無い 401 |
| admin | `ctxAdmin(locals, platform)` | 403 |

- **ログイン不要のパスを増やすのは `PUBLIC_PATHS` だけ。** ルートの中で個別に通さない
- `/` は未ログインでも開き、紹介ページを出す。`load` は `locals.user` が無ければ DB に触らず
  `{ landing: true }` だけを返す。**ここで何か引くと、そのまま誰にでも見える**
- **Bearer が効くのは `/mcp` だけ。** ほかのパスは `Authorization` を読まない。`/mcp` は Cookie を読まない
- `/oauth/token` は SvelteKit に来る前に `src/worker.js` が受ける（SvelteKit の CSRF の検査が Origin の無いフォームの
  POST を落とすため。→ [architecture.md 3-10](./architecture.md)）。だから `PUBLIC_PATHS` に無い
- `/notes/` は共有ページのための公開パス。**ログインが要る画面を `/notes/` の下に作らない**
  （共有の取り消しが `/settings/shares` にあるのはこのため）
- 本番ビルドでは SvelteKit が POST の `Origin` を検証する（CSRF）。`vite dev` では効かないので、
  form POST は E2E で確かめる（→ [testing.md](./testing.md)）

## 3. ルートの一覧

`?/名前` は名前付き action、`default` は `?/` 無しで POST する action。

### 公開

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/login` | GET | `redirect`・`error` | ログイン済みなら `302` で `redirect` へ | — |
| `/auth/google` | GET | `redirect` | `302` Google の認可画面（state と PKCE を Cookie に10分） | `302 /login?error=unavailable` |
| `/auth/google/callback` | GET | `code`・`state` | ユーザーを作るか引き、セッションを発行して `302` 元の画面へ | `302 /login?error=invalid_request\|oauth_failed\|unavailable` |
| `/` | GET | — | 未ログインなら紹介ページ（DB に触らない）。ログイン済みはダッシュボード（下の表） | — |
| `/privacy` | GET | — | プライバシーポリシー（Google の同意画面に登録する） | — |
| `/terms` | GET | — | 利用規約（同上） | — |
| `/api/health` | GET | — | 死活監視。D1 に `select 1` が通れば `200 {"status":"ok"}`。状態以外は返さない。`Cache-Control: no-store`（→ [monitoring.md 第6章](./monitoring.md)） | `503 {"status":"error"}` |
| `/.well-known/oauth-protected-resource`（と `/mcp` 付き） | GET | — | 保護されたリソースのメタデータ（RFC 9728）。`resource`・`authorization_servers`・`scopes_supported` | — |
| `/.well-known/oauth-authorization-server` | GET | — | 認可サーバーのメタデータ（RFC 8414）。PKCE は S256 だけ・公開クライアントだけ | — |
| `/oauth/register` | POST（JSON） | `client_name`・`redirect_uris`（1〜5。https かループバックの http）・`token_endpoint_auth_method`（`none` だけ） | `201` と `client_id`。何の権限も持たない | `400 invalid_redirect_uri` / `invalid_client_metadata`・`413` 本文超過・`429 temporarily_unavailable` 登録上限（`Retry-After: 60`。上限と期限は architecture.md 3-10） |
| `/oauth/token` | POST（フォーム） | `grant_type=authorization_code`（`code`・`redirect_uri`・`client_id`・`code_verifier`）か `refresh_token`（`refresh_token`・`client_id`・`scope` で狭められる）。`resource` は自分の `/mcp` だけ | アクセス（1時間）とリフレッシュ（30日・1回きり。応答が届かずに30分の内に同じものを送り直したとき、出したアクセストークンが使われていなければ、届かなかった1組を止めて出し直す）。`no-store` | `400 invalid_grant`（コードの再利用・PKCE・戻り先・期限・別のクライアント）/ `invalid_scope` / `invalid_target` / `unsupported_grant_type`。使い回されたリフレッシュトークン（出したトークンが使われたあと・猶予を過ぎたあと）は連携ごと消す。同時更新の競合は連携を保持して `503 temporarily_unavailable`（`Retry-After: 1`）。送り直しは最初の更新で確定したスコープを引き継ぎ、`scope` を省略しても縮小前に戻らず、異なる `scope` は `invalid_scope`  |
| `/notes/[id]` | GET | — | unlisted のメモ1件。`X-Robots-Tag: noindex, nofollow`・`Referrer-Policy: no-referrer`・`Cache-Control: private, no-store` | **404**（private でも存在しなくても同じ） |

### ログインした人

予想まとめの公開ルートは `GET /shared/races/[id]`。共有用コピー1件と公開名、ログインしているかの真偽（`signedIn`。
未ログインの人にだけ末尾の案内を出すため → [product.md](./product.md#予想まとめ)）だけを返す。
見つからない・取り消し済み・著者凍結済みは404。`/notes/[id]` と同じ `noindex` / `no-referrer` / `no-store` を付ける。
両方の共有ページで、ルートレイアウトは `user: null` を返し、本人の閲覧時にもアカウント情報を送らない。

`/shared/races/[id]` は SNS に貼ったときのプレビュー（OGP）を持つ。`og:title`・`og:description`（公開名と印の並び）・
`og:image`（絶対 URL。`?v=<更新時刻>-<公開名のハッシュ>`）・`twitter:card=summary_large_image`。組み立ては `utils/share-card.ts`。
画像は `GET /shared/races/[id]/og.png`（`+server.ts`）。同じコピーと公開名から印の表を描いた 1200×630 の PNG を返す。
404 の条件と `noindex` / `no-store` は共有ページと同じ。`vite dev` では描けず 503（→ [architecture.md 3-7](./architecture.md)）。

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/` | GET | — | 自分の最近のメモ・今週と過去のレース・推しの出走予定 | — |
| `/help/webmcp` | GET | — | WebMCPの使い方。ブラウザの対応確認・準備・予想画面での下書き反映と保存。toolsは登録しない | — |
| `/this-week` | GET | `w`（週のずれ。整数） | その週の重賞 | 整数でなければ今週 |
| `/races` | GET | `year`・`grade`（複数）・`q`・`offset` | レース一覧を `offset` 件目から100件と、条件に当たる総数。画面は下端で `offset` を付けてこの `load` を `preloadData` で呼び、続きを足す | 未知の値は捨てる。`offset` が数字でなければ 0 |
| `/races/[id]` | GET | — | ふりかえり画面。**開催前なら `302 /races/[id]/preview`** | 404 |
| `/races/[id]` | POST `default` | `raceNoteBody`・`body.<entryId>`・`tags.<entryId>`（複数） | ふりかえりを一括保存。`{ savedAt }` | 開催前 400 / 検証 `fail(400)` / 404 |
| `/races/[id]/preview` | GET | — | 出馬表・馬柱・過去のメモ・オッズ（D1 にある最新の値と時点） | 404 |
| `/races/[id]/preview` | POST `default` | `raceNoteBody`・`racePace`・`flowSpots.<局面>`（JSON）・`flowMemo.<局面>`・`body.<entryId>`・`tags.<entryId>`・`mark.<entryId>`（局面は `start`・`corner4`・`finish`） | 見立て（展開の予想を含む）と予想印を一括保存。盤面の馬はこのレースの出走馬に絞る | 検証 `fail(400)` / 404 |
| `/horses` | GET | `q`・`offset` | 馬一覧を `offset` 件目から100頭（続きの読み方は `/races` と同じ） | `offset` が数字でなければ 0 |
| `/horses/[id]` | GET | — | プロフィールとタイムライン・自分の推しか | 404 |
| `/horses/[id]` | POST `?/favorite` | `favorite`（`1` で推しにする・`0` で外す） | 自分の推しを切り替え、`{ favorite }` を返す。何度送っても同じ状態になる | 検証 `fail(400)` / 無い馬 404 |
| `/horses/[id]` | POST `?/addNote` | `body`・`tags`（複数）・`occurredAt` | 近況メモを足す | 検証 `fail(400)` / 404 |
| `/horses/[id]` | POST `?/deleteNote` | `noteId` | 自分のメモを消す | 他人のメモ・無いメモは `fail(403)` |
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
| `/oauth/authorize` | GET | `response_type=code`・`client_id`・`redirect_uri`・`code_challenge`・`code_challenge_method=S256`・`state`・`scope`・`resource` | 同意画面（アプリの名前・戻り先のホスト・スコープ）。`X-Frame-Options: DENY`・`no-store` | 要求の誤り（クライアント・戻り先・PKCE・`response_type`・`resource`）は**戻り先へ飛ばさず**画面に出す（オープンリダイレクトにしない） |
| `/oauth/authorize` | POST `default` | GET と同じ項目（hidden）・`decision`（`allow`\|`deny`）・`scope_grant`（複数） | `303` 戻り先に `code`・`state`・`iss`。拒否なら `error=access_denied`。同じクライアントへの前のトークンは消す | 要求の誤り `fail(400)`（画面に出す） |
| `/settings/connections` | GET | — | MCP の接続先 URL と、本人が許可したアプリ（名前・戻り先のホスト・スコープ・日付） | — |
| `/settings/connections` | POST `?/revoke` | `grantId` | 本人の連携を解除（コードとトークンも消える） | 検証 `fail(400)` / 他人の連携・無い連携 `fail(404)` |

### admin だけ（`ctxAdmin`）

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/horses/[id]` | POST `?/saveProfile` | `nameKana`・`sex`・`birthYear`・`trainer`・`sire` など（**馬名は含まない**） | プロフィールを更新 | 403 |
| `/races/new` | GET / POST `default` | レースの項目（`raceSchema`） | `303 /races/[id]/entries` | 検証 `fail(400)` / 同じ日付・場・R `fail(409)` / 403 |
| `/races/[id]/entries` | GET / POST `default` | `rowCount`・`horseName.<i>`・`bracket.<i>`・`horseNumber.<i>` ほか | `303 /races/[id]` | 検証 `fail(400)` / 同じ馬名が2行 `fail(400)` / 馬番か馬の重複（UNIQUE） `fail(409)` / 403 |
| `/settings/admin` | GET / POST `?/freeze` | `userId` | ユーザーを凍結し、セッションと AI との連携（`oauth_grant`。コードとトークンも CASCADE）を全部消す | 自分自身は `fail(400)` / 403 |
| `/settings/admin` | POST `?/fetchEntries` | `raceId` | そのレースの出走馬の取得を GitHub Actions に頼み、`{ requested }` を返す（D1 には書かない。→ [architecture.md 3-9](./architecture.md)） | 無いレース `fail(404)` / 引けないレース（レース番号なし・race_id が無く当週でもない。`entriesFetchBlocker`）`fail(400)` / トークン未設定 `fail(503)` / GitHub が受け付けない `fail(502)` / 403 |

### 開発サーバーだけ

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/dev/mock-user` | POST | `as`（`admin`\|`user`）・`redirect` | モックのユーザーに切り替えて `303` | 本番ビルドでは 404 |
| `/dev/notify-test` | POST | — | Discord へ ERROR を1件送る（疎通確認。→ [monitoring.md 第6章](./monitoring.md)） | 本番ビルドでは 404 |

### MCP クライアント（Bearer）

| パス | メソッド | 入力 | 成功 | 失敗 |
| --- | --- | --- | --- | --- |
| `/mcp` | POST（JSON-RPC 1件） | `initialize`・`ping`・`tools/list`・`tools/call`、通知 | JSON で返す（SSE なし）。通知は `202`。tools/list はトークンのスコープで呼べる tool だけ | トークンなし・無効 `401` / Bearer はあるが DB に届かない `503` / スコープ不足 `403`（`WWW-Authenticate: … error="insufficient_scope", scope="…"`）/ 別オリジンの `Origin` `403` / 壊れた JSON・バッチ・知らない `MCP-Protocol-Version` `400` / 本文が8 KiBを超える `413` / tool の入力の誤り・見つからないは `200` の `isError: true` |
| `/mcp` | GET・DELETE | — | — | `405`（サーバーから流す SSE とセッションは持たない） |

tools（どれも読むだけ。`viewerId` はトークンの持ち主で、入力は余計な項目を受けない `strictObject`）:

| tool | スコープ | 入力 | 返すもの |
| --- | --- | --- | --- |
| `search_races` | `races:read` | `q`・`year`・`limit`（1〜50） | レース（新しい順）。`notes:read` もあれば `myNoteCount`（自分のメモの件数） |
| `get_race` | `races:read` | `raceId` | レースの条件・出走馬（馬番・騎手・着順）・オッズとその時点 |
| `get_horse` | `races:read` | `horseId`・`limit`（1〜100） | 馬のプロフィール（性・生年・調教師・父母）と出走歴 |
| `get_my_race_notes` | `notes:read` | `raceId` | そのレースの自分の見立て・ふりかえり・各馬のメモ・印・札・展開 |
| `get_my_horse_notes` | `notes:read` | `horseId` | その馬の自分のメモ |
| `list_my_recent_notes` | `notes:read` | `limit`（1〜50） | 自分の最近のメモ |

### HTTP でない口 — Cron Trigger

| 起動 | 入口 | すること |
| --- | --- | --- |
| `5 1-10 * * *`（UTC。JST 10:05〜19:05 の毎時） | `src/worker.js` の `scheduled` → `lib/server/race-data/scheduled.ts` | 1〜3日後の重賞で馬番がまだ無いレースの出走馬の取得を、GitHub Actions に頼む（枠順が確定していなければ Actions は何も書かない。→ [architecture.md 3-9](./architecture.md)） |

ルートと同じく、監視の口と D1 クライアントは入口（`scheduled.ts`）が1回ごとに作る。
ログインの概念は無い（誰の操作でもない）。

オッズの更新は Worker の Cron ではなく GitHub Actions（`odds-update.yml`）がする。Worker の口は無く、
Actions が `wrangler d1 execute` で `race_odds` に書く（→ [architecture.md 3-8](./architecture.md)）。

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
- 1リクエストの D1 クエリは10以内。読みは JOIN か `Promise.all`、書きは `batch()` にまとめる
- DB は `createDb(platform.env, locals.monitor.onQuery)` で作る（`ctx()` を通せば済んでいる）。
  ログは `console.*` ではなく `locals.monitor.log()` で出す（→ [monitoring.md 第2章](./monitoring.md)）

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

| 読むもの | 引数 | WHERE |
| --- | --- | --- |
| メモ | **`viewerId` を必須で受ける**（省略可能にしない・既定値を与えない） | `author_id = :viewer` |
| 共有ページのメモ（`getSharedNote` だけ） | `noteId` | `id = :id AND visibility = 'unlisted'` |
| 馬・レース・出走馬（マスタ）・オッズ | 絞らない | 全員に共通 |
| 推しの馬 | **`viewerId` を必須で受ける** | `user_id = :viewer`（誰が何を推しているかを他人に見せない） |
| 騎手のまとめ（`jockey_note`） | **`viewerId` を必須で受ける** | `user_id = :viewer` |
| マスタの一覧にメモの件数を添えるもの（`listHorses`・`listRacesBetween` など） | `viewerId` を必須で受ける | 件数は viewer のメモだけで数える（他人が何か書いていることを漏らさない） |

- メモを書く・消す関数は `authorId` を受け、WHERE に入れる。他人のメモに当たったときは
  例外にせず `false` を返す（`deleteNote`・`setNoteVisibility`）
- マスタの書き込み（`createRace`・`saveEntries`・`updateHorseProfile`）はサービス層では権限を見ない。
  呼ぶルートが `ctxAdmin` を通す

### 今ある関数

| ファイル | 読み | 書き |
| --- | --- | --- |
| `services/horses.ts` | `listHorses`・`getHorse`・`getHorseEntries` | `findOrCreateHorse`・`updateHorseProfile` |
| `services/races.ts` | `listRaces`・`countRaces`・`listRacesBetween`・`listRaceYears`・`getRace`・`listEntries`・`listEntriesForPreview`・`resolveWeek`・`listGradedRacesInWeek`・`listPastRuns`・`listRunsForHorse` | `createRace`・`updateRace`・`saveEntries` |
| `services/odds.ts` | `getRaceOdds` | —（GitHub Actions が `scripts/odds/store.ts` の SQL で書く。→ [architecture.md 3-8](./architecture.md)） |
| `services/entries-fetch.ts` | `listEntriesFetchTargets`・`listUpcomingRaces`・`entriesFetchBlocker`（D1 を読まない判定） | —（出馬表は YAML の PR で入る） |
| `services/notes.ts` | `listRaceNotes`・`getHorseTimeline`・`listRecentNotes`・`listWatchSources`・`listSameConditionRaceNotes`・`listHistoryForHorses`・`getSharedNote`・`listSharedNotes` | `saveRaceReview`・`savePreviewNotes`・`addHorseNote`・`deleteNote`・`setNoteVisibility` |
| `auth/session.ts` | `validateSession`・`findUserByGoogleSub` | `createSession`・`invalidateSession`・`invalidateAllSessions`・`deleteExpiredSessions`・`createUser` |
| `auth/oauth.ts` | `getClient`・`validateAccessToken`・`listGrants`（`userId` を必須で受け、`user_id = :viewer`）・`verifyPkce`（D1 を読まない） | `registerClient`・`createAuthorizationCode`・`exchangeAuthorizationCode`・`refreshTokens`・`revokeGrant`（`userId` を WHERE に入れる。他人の連携は `false`） |
| `services/profile.ts` | `getPublicName` | `setPublicName` |
| `services/favorites.ts` | `isFavoriteHorse`・`listFavoriteHorses`・`listFavoriteRuns` | `setFavoriteHorse` |
| `services/jockeys.ts` | `listJockeys`・`listJockeyTagsInUse`・`listJockeyRides`・`listJockeyRideNotes`・`jockeyExists`・`getJockeySummary`・`mergeJockeyTimeline`（D1 を読まない組み立て） | `saveJockeySummary` |
| `services/race-shares.ts` | `getRaceSummary`・`getOwnRaceShare`・`getSharedRaceSummary`・`listRaceShares` | `publishRaceSummary`・`revokeRaceShare` |

関数を足したら、この表にも足す。
