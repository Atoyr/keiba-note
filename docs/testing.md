# uma-memo のテストと確かめ方

変更をどう確かめるか。テストの置き場と書き方、E2E の環境、画面カタログ、
PR に貼るキャプチャの撮り方。

- **読む場面:** コードを変えるときは毎回（テストを書く・`verify` を通す・キャプチャを撮る）
- **ここに無いもの:** 仕組みをなぜこう組んだか・これから足す検査は [harness.md 第5層](./harness.md)、
  ルートごとの入出力は [api.md](./api.md)、
  評価（Evaluator）は [evaluation.md](./evaluation.md)、レビューは [review.md](./review.md)
- 作成日: 2026-09-23 / 最終更新日: 2026-10-25

---

## 1. 何を、どこで確かめるか

| 確かめること | 仕組み | 置き場 | 落ちるコマンド |
| --- | --- | --- | --- |
| 型・Svelte の検査 | `svelte-check` | — | `pnpm run check` |
| 出走馬データ（`data/races/*.yaml`）の書式と整合 | `scripts/import-races.ts --check` | `data/` | `pnpm run data:check`（`data/` を触るとき。CI の `ci.yml` が回す） |
| 整形・lint・文書の参照 | Prettier / ESLint / `scripts/check-docs.ts` | — | `pnpm run lint` |
| サーバー・サービス層・純ロジック・権限の絞り込み・日付の境界 | Vitest（node） | `src/**/*.spec.ts` | `pnpm run test:unit` |
| Svelte コンポーネントの表示と操作 | Vitest（実 chromium） | `src/**/*.svelte.spec.ts` | 同上 |
| `scripts/` の道具（netkeiba の読み取り・YAML への当てはめなど）と E2E の seed（`e2e/seed.ts`） | Vitest（node） | `scripts/**/*.spec.ts`・`e2e/**/*.spec.ts` | 同上 |
| 画面の振る舞い・認可・form POST（CSRF） | Playwright（本番ビルド + E2E 専用 D1） | `e2e/*.e2e.ts` | `pnpm run test:e2e` |
| 全画面が開けること・実行時エラー・mobile ではみ出さないこと | 画面カタログ | `e2e/screens.ts`（1行足す） | 同上 |
| PR 本文の欄（画面・評価・コードレビューなど）が埋まっているか。選ばれたレビュアーの結果があるか（手元では `REVIEW_BASE=origin/main` も渡す） | `scripts/check-pr-body.ts` | `.github/workflows/pr-body.yml` | CI の「PR 本文」（手元では `pnpm run pr:check`） |
| 頼まれたものか・使いやすいか | **Evaluator**（書いたのとは別のエージェント） | [evaluation.md](./evaluation.md) | PR 本文の「評価」に ✗ が残る |
| 見た目が意図どおりか | **人**がキャプチャを見る | `docs/screenshots/<機能名>/` | PR で差し戻す |

`data:check` の行と、PR 本文以降の行を除いた上の行は `pnpm run verify`（check → lint → 単体 → E2E）に入っている。
CI（`.github/workflows/ci.yml`）も同じものを回し、画面カタログのキャプチャを artifact `screens` として上げる。
ただし `data/` と文書（`docs/`・`*.md`）だけの PR では、CI は E2E のジョブを飛ばす（`ci.yml` の「E2E の要否」）。
**アプリと E2E から `data/`・`docs/` の下と `.md` を読まない。** 読まないから飛ばしてよい。読ませるなら、`ci.yml` の条件と
`scripts/e2e-if-needed.ts` の `isDocsOnly` の両方を直す（直さないと、その変更の E2E が黙って飛ぶ）。
手元の `verify` も、文書（`docs/`・`*.md`）だけの変更では E2E を飛ばす（`scripts/e2e-if-needed.ts`。
`origin/main` との分岐点から作業ツリーまでの変更を見る。未追跡のファイルも含む）。**`data/` は手元では飛ばさない**（CI は飛ばす）。
こうして `verify` が自分で E2E を飛ばしたときは、1-2 の「省略」に当たらない。`verify` が green なら完了にしてよい。
`verify` と `screens` はビルドを含むので数分かかる。

### 1-1. 初回の検証準備

[README.md のセットアップ](../README.md#セットアップ) に従い、Node・pnpm・依存関係・Chromium を用意する。
単体テストも Chromium を使うので、E2E の自動導入を待たず、`verify` や `test:unit` より先に導入する。

### 1-2. 検証を完了できないとき

PR に書く「確認したこと」の形はここで決める。

実装変更は原則として `pnpm run verify` を通す。検証を省いた理由を書くことは、成功や完了の代わりにはならない。
ユーザーが検証範囲を指定した場合はその指定を優先し、実行していない検証も明記する。

1. **今回の変更が原因なら修正する。** 失敗したコマンド・終了コード・ログを保存し、差分と照らす。
   整形も変更したファイルを直す。修正後は `verify` を最初から回し直す。
2. **環境・権限・外部障害・変更前からの失敗は、根拠を確認して区別する。** 実行中に JST の 0 時をまたいだ失敗もここに入る（3-2）。
   バージョンやエラーログ、同じ環境での変更前の実行結果、変更前コミットの CI 結果などを使う。
   変更前の確認のために作業中の変更を捨てない。根拠が足りない場合は「原因未確定」と書く。
3. **許可された範囲で解消できるものを直し、実行可能な検証は続ける。**
   初回の依存関係・ブラウザ不足はセットアップを確認する。本番の認証情報・D1・シークレット・デプロイで
   代用しない（[architecture.md 第0章](./architecture.md)）。同じ原因のまま再試行を繰り返さず、
   再実行は原因への対処や環境の回復を確認してから行う。無関係な修正へ作業を広げない。
4. **解消できない場合は未完了として引き継ぐ。** PR を作れるなら Draft PR にまとめ、
   「確認したこと」に下の記録を残す。作成できなければ変更を作業ツリーやローカルコミットに保存し、
   検証結果・ログの保存先・PR 作成の阻害要因を `TASKS.md` と結果報告に残す。
   必須の検証や評価が残る間は「検証済み」「完了」とせず、`verify` のチェックも付けない。

引き継ぎの記録には、次の項目をすべて含める。

- 実行した検証: コマンド・対象のコミットや差分・環境・結果・ログの保存先（または CI のリンク）
- 失敗内容: エラーと、今回の変更が原因かどうかを区別した根拠。原因未確定ならその旨
- 省略・未検証項目: 実行できなかった検証、途中で止まって未到達の工程、理由。未評価・未撮影も含む
- 再開に必要な条件: 必要な環境・権限・外部サービスの回復などと、再開後に実行するコマンド

## 2. テストを書くときの約束

- **足した・変えた分岐は1本以上テストを通す。** 権限で絞る条件・リダイレクト先の組み立て・
  日付の境界は特に落とさない。ここを間違えると他人のメモが見えてしまう
- **画面・ルーティング・認可を触ったら E2E を足すか直す。** 未ログインで開けないこと、
  他人の id で開けないことを見る。未ログインの確認は `e2e/auth.e2e.ts` の `PROTECTED` に1行足す
  （認証は hooks で一律に効くので、画面ごとに別のテストを書かない）
- **MCP の tool やスコープを足したら、スコープ不足と他人のデータの確認を単体と E2E の両方に足す**
  （`/mcp` は 302 でなく 401 なので `PROTECTED` では確かめられない。何を足すかは [mcp.md](./mcp.md)）
- **form POST を足したら E2E で確かめる。** CSRF の検証は本番ビルドでしか効かない（`vite dev` では通ってしまう）
- **E2E で入力欄に書く・送信する前と、JS で動くボタン（出走馬の行のメモのボタンなど）を押す前は hydration を待つ。** `gotoHydrated` か `waitForHydration`
  （`e2e/hydration.ts`）を使う。`page.goto` が待つのは load までで、hydration はそのあとに走る。
  先に書いた値は hydration のあとに書き戻される（[frontend.md 第4章](./frontend.md)）が、済む前に
  送信すると `use:enhance` の無い送信になり、`DraftKeeper` もまだ動いていない。並列で JS の配信が
  遅れたときだけ違う経路を通るので、待って揃える。印はルートレイアウトの onMount が `<html data-hydrated>` に立てる。
  `bind:open` の `<details>`（騎手のまとめ・重賞の傾向の書く欄）を開く前も待つ。hydration が `open` を状態の値（閉じ）に書き戻す。
  これは利用者にも起きる（JS が届く前に開くと閉じる）。待つのはテストの都合で、画面側で避けるなら
  `NoteMenu.svelte` のように `bind:open` にせず要素の `open` を直に読み書きする
- **E2E でリンクの行き先は `expectLinkTo`（`e2e/link.ts`）で見る。href 属性では見ない。** `resolve()` の href 属性は SSR では相対パス（`paths.relative` の既定）で、
  hydration のあとに絶対パスへ書き直される。`toHaveAttribute('href', '/…')` も `a[href^="/…"]` のようなセレクタも、hydration が間に合ったときだけ当たる
  （`toHaveCount(0)` なら中身を見ずに通る）。要素はロールと名前で取る。属性で絞るのは `gotoHydrated` / `waitForHydration` のあとだけ
- `expect.requireAssertions` が有効。アサーションの無いテストは落ちる
- `.only` と `test.skip` は残さない
- コンポーネントのテストは対象の隣に置く（`GradeBadge.svelte` → `GradeBadge.svelte.spec.ts`）

## 3. E2E の環境

E2E の出力は dot（1件1文字）。失敗したテストだけ、最後に詳しく出る。

### 3-1. 専用の D1 — `.wrangler/e2e`

E2E のプレビューサーバー（`playwright.config.ts` の webServer）は `wrangler dev --persist-to .wrangler/e2e`
で上がり、開発用の `.wrangler/state` とは別の D1 を見る。**開発用 D1 の中身は E2E に関係しない。**

サーバーの定義は `scripts/preview-e2e.ts` にあり、`pnpm run preview:e2e` で単独でも上げられる。
起動のたびに E2E の D1 を seed し直すため、手元で書いたメモも次の起動や E2E で消える。
**同じ worktree で `verify`・`test:e2e`・`screens` を回す前に `preview:e2e` を止める**（Claude Code の Preview で `.claude/launch.json` の `preview-e2e` から上げたものも同じサーバー。ポートは 4173 に決めてあるので、上げたままだとどの worktree の既定の `verify` も起動で落ちる）。 E2E は自分でサーバーを上げるので、
同じポートなら起動で落ち、`E2E_PORT` だけ変えても同じ `.wrangler/e2e` を取り合って落ちる（`E2E_PORT` は worktree を並べるときに使う）。

同じ D1 を共有すると、手元で `data:import:local` した本物の出馬表や `pnpm run dev` で書いたメモが
E2E とキャプチャに混ざり、人によって結果が変わって before / after の比較が成り立たないため、分けてある。

`scripts/preview-e2e.ts` の最初の手順で `e2e/seed.ts` が毎回、次の順で状態を作り直してから、ビルドと `wrangler dev` に進む。

1. `wrangler d1 migrations apply --local --persist-to .wrangler/e2e`（冪等）
2. 全テーブルを `DELETE`（テーブル名はその場で `sqlite_master` から引く。テーブルを足しても直さなくてよい）
3. `e2e/seed.sql` を流す

これで E2E は `pnpm run test:e2e` だけで完結する。事前の `db:migrate:local` は要らない。

**seed は `globalSetup` に置かない。** Playwright は webServer を globalSetup より先に立ち上げるので、
`globalSetup` で seed すると、上がったあとの `wrangler dev` と seed の `wrangler d1` が同じ SQLite を開いて取り合い、
ときどき `database is locked: SQLITE_BUSY` で落ちる。`wrangler dev` を立てる前に seed を終わらせる。

プレビューサーバーのポートは既定で 4173。**同じマシンで別の worktree も E2E を回すときは
`E2E_PORT` を変える。** 同じポートを取り合うと相手のサーバー（相手の D1）に当たり、
前の実行の途中の行が見えたり、途中でつながらなくなったりして、テストと関係なく落ちる。

### 3-2. seed — `e2e/seed.sql` と `e2e/seed.ts`

- 行の id は固定の ULID 風の文字列にし、テストから参照するものは `seed.ts` に定数で export する
- ログインは seed のセッション（`SESSION_TOKEN`）を Cookie に載せて行う（`e2e/login.ts`）。
  本番ビルドにはモック認証が無いので、これが唯一の経路
- `/mcp` は seed のアクセストークン（`MCP_TOKENS`。全部を許した自分・races:read だけの自分・別のユーザー）を
  Bearer に載せて叩く（`e2e/mcp.e2e.ts`）。連携を解除するテストは自分で作った連携だけを解除する（並列で走るため）
- 日付に依存する画面（ダッシュボードの「今週」など）は `date('now', '+9 hours', ...)` で
  seed を流した日から決める。未来であり続けてほしい行は 2099 年に置く
- **seed からテストの終わりまでに JST の 0 時をまたぐと、日付に依存するテストが落ちる。** seed の日付は流した日に
  固定されるが、サーバーの「今日」は実時刻で進む（日→月では `currentWeek` が切り替わり、「今日のレース」が今週から消える）。
  サーバーの時計は偽れないので、0 時まで 15 分を切っていたら `e2e/seed.ts` が 0 時を過ぎるまで待ってから流す
  （`waitBeforeSeed`。その日は webServer の `timeout` も `webServerTimeout` で伸ばす）。
  防げるのは 0 時の 15 分前より後に始めた実行だけ。それより前に始めて 0 時をまたぎ、`/this-week`・管理画面・
  ダッシュボードなど日付に依存するテストだけが落ちたら、今回の変更による失敗ではない。回し直す（1-2 の 2）
- 撮るのに要る行が無ければ seed に足す

## 4. 画面カタログ — `e2e/screens.ts`

人がキャプチャで確かめる画面の一覧。1画面（または1状態）1行。

```ts
{ name: 'race-preview-editing', path: `/races/${PREVIEW_RACE_ID}/preview`, auth: true,
  prepare: async (page) => {
    await waitForHydration(page); // メモのボタンは JS で開く。hydration 前に押しても何も起きない
    await page.getByRole('button', { name: /出走前メモを書き直す/ }).click();
  } }
```

- `name` はファイル名になる（英小文字とハイフン）
- `prepare` で「開いた」「入力した」などの状態にしてから撮る。同じ URL の別状態は別の行にする
- `screens.e2e.ts` がこれを desktop（1280px）と mobile（390px）の2幅で開き、
  応答が 400 未満であること・ログイン画面に飛ばされないこと・`pageerror` と `console.error` が
  無いこと・mobile で横にはみ出さないことを確かめてから、全体を撮る
- **画面カタログのテストは並列に走る。`prepare` でサーバーに書かない。** 書くとテスト同士がデータを取り合う。
  保存の結果を見せたいときは `page.route` でモックする（例: `race-review-saved`）
- 撮る前に末尾までスクロールする（下に貼り付く保存ボタンを本来の置き場に収めるため）。
  **下端で続きを読む一覧（`LoadMore`）は `stayAtTop: true` を付ける。** スクロールすると撮っている間に
  続きが読まれ、撮るたびに違う画像になる。読んだあとの状態は `prepare` で読み終えるまで待つ別の行にする

**画面を足した・見せたい状態が増えたときは、ここに1行足すのが変更の一部。**
足さないと、その画面は機械の確認からもキャプチャからも漏れる。

## 5. PR に貼るキャプチャ

### 5-1. 撮る — `pnpm run screens <機能名> <before|after> [画面名...]`

- 機能名は英小文字とハイフン。画面名を並べれば、その画面だけを撮る
- **before は手を入れる前に撮る。** あとからは撮れない
- `scripts/screens.ts` が `screens.e2e.ts` だけを走らせ、
  `docs/screenshots/<機能名>/<before|after>/<画面名>.<desktop|mobile>.png` に置く
- `docs/screenshots/` は `.gitignore` に入っている。**キャプチャはコミットしない**（貼り方は 5-2）

after のときは、同名の before と画素単位で比べ、**見た目が変わらなかった組は両方消す**。
残るのは「この変更で見た目が変わった画面」と「before の無い（新しい）画面」だけになる。
残った画像は自分で開いて、指示どおりか・崩れていないか（はみ出し、重なり、mobile での折り返し、
意図しない画面まで変わっていないか）を確かめる。

比較は chromium の canvas で行う（依存を増やさないため）。どれかのチャンネルが 16/255 を超えて
ずれた画素が1つでもあれば「変わった」とみなす。同じコードを2回撮っても枠線の縁などが
8/255 ほど揺れるので完全一致では比べられない。一方で gray-500 → gray-600 程度の色替えでも
30 前後は動くので、その間を取っている。

**見た目を変えないはずの変更（リファクタリング、同じ値のトークンへの置き換え）は、
残る画像が0枚になることが確かめになる。**

### 5-2. 貼る — `pnpm run screens:pr <機能名>`

`scripts/pr-screens.ts` が、キャプチャを画像置き場の **`screenshots` ブランチ**へ1コミットで push し、
表（画面 / before / after）を Markdown で出す。PR 本文の「画面」に貼る。
画像の URL は `https://raw.githubusercontent.com/<owner>/<repo>/<screenshots のコミットSHA>/<機能名>/...` で組む。
作業ツリーと今のブランチには触らない（一時の index で木を組み、`commit-tree` と `push` だけを行う）。

- **`screenshots` は main に合流させない。** 画像だけを持つ枝で、PR の差分と main の履歴に画像が入らない。
  このブランチを消したり force push したりすると、過去の PR の画像が見えなくなる
- 各コミットの木はその回の画像だけを持ち、直前の先端を親にする。親から辿れるので、古い画像も消えない
- ブランチ名でなく SHA で組むのは、同じ機能名で上げ直しても、前に貼った画像が差し替わらないようにするため。
  撮り直したら `screens:pr` を回し直し、出た表で PR 本文を貼り替える
- ほかの作業ツリーと同時に上げて push が弾かれたら、最新の先端を親に組み直して3回まで試す

### 5-3. 溜めない

キャプチャはコミットしないので、作業ブランチと main には溜まらない。手元の `docs/screenshots/<機能名>/` は
PR を出したあと消してよい（次に同じ機能名で撮るときは `screens` が撮る範囲を消してから撮る）。

### 5-4. 写してはいけないもの

実在のメールアドレスや本番データを写さない（このリポジトリは public）。
`pnpm run screens` は seed のデータだけで撮るので、これを使えば守られる。
`pnpm run dev` の画面を撮って貼らない。

## 6. 決定性のための約束

キャプチャの比較が意味を持つのは、同じコードなら同じ画像になるときだけ。

- **データは seed の行だけ。** 画面に出るものが足りなければ seed を足す。E2E のテストが行を
  書くのは構わない（次の実行の前に消える）。`pnpm run screens` は `screens.e2e.ts` だけを
  走らせるので、seed だけの状態で撮れる
- **before と after は同じマシンで撮る。** フォントの描画は OS で違う。CI の artifact と手元の
  キャプチャを見比べない
- アニメーションは止め（`animations: 'disabled'`）、キャレットは隠し、`networkidle` と
  `document.fonts.ready` を待ってから撮る
- 時刻に依存する表示は、seed を流した日の中では変わらない。日付をまたいで before / after を
  撮ると差が出うる

## 7. 限界

- **WebMCP は実験フラグを CI の前提にしない。** ブラウザの境界は `e2e/webmcp.ts` がモックする。
  ブラウザと AI Browser Agent の実接続はこの検証に含まない（何を確かめるかは `webmcp.e2e.ts` と `DraftKeeper.svelte.spec.ts`）
- **admin の画面は `/settings/admin` と、`as: 'admin'` を付けた行だけがカタログにある。** seed に admin のユーザーとセッション
  （`ADMIN_SESSION_TOKEN`）があり、`Screen` の `as: 'admin'` で開く。`/races/new`・`/races/[id]/entries` も
  同じように1行足せば撮れる
- **GitHub Actions を起動するところ（出走馬の取得）は E2E では確かめない。** E2E はトークンを渡さない
  （`playwright.config.ts` の `--var GITHUB_DISPATCH_TOKEN:`）ので、見るのは「押せない」「直接送っても断る」まで。
  GitHub に送る中身は `lib/server/race-data/dispatch.spec.ts` で見る
- **開発サーバーにしか無い経路**（モック認証の警告帯・ユーザー切り替え）は本番ビルドに無いので撮れない
- 見た目の回帰を自動で止める仕組み（`toHaveScreenshot` の基準画像のコミット）は入れていない。
  OS ごとに基準画像が要り、見た目を変えるたびに更新の手間がかかる割に、この規模では
  人が before / after を見るほうが安い。変わった画面だけを出す仕組みで代えている

## 8. 紹介ページのキャプチャ — `pnpm run landing:shots`

未ログインの `/`（`LandingPage`）は、機能ごとに実際の画面のキャプチャを載せている。
これは PR に貼るキャプチャ（第5章）とは別物で、**コミットして紹介ページがそのまま読む**
（`src/lib/assets/landing/*.png` を import する。ビルドで `/_app/immutable/` に置かれる）。

- 撮るのは `e2e/landing/shoot.ts`（設定は `playwright.landing.config.ts`）。`pnpm test` には入らない
- データは**見本データ** `e2e/landing/seed.sql` だけ。E2E とは別の D1（`.wrangler/landing`）に
  `e2e/seed.ts landing` が流す。E2E の seed の馬名（「E2E〜」）は紹介に向かず、見本の行を E2E の seed に
  混ぜると E2E の画面の前提が変わるので、分けてある
- 馬・レース・人名は架空にする（第5章 5-4 と同じく、本番のデータを写さない）。騎手は入れない
- 日付は seed を流した日から決まる（ダッシュボードの「今週」「ふりかえり待ち」を埋めるため。JST の 0 時の 15 分前からは、0 時を過ぎるまで seed が待つ。→ 3-2）。起点は撮った日以降で最初の日曜で、
  どのレースも土日に落ちる。**開催場は撮る時期に開いている場を選んである**（前提の時期は `e2e/landing/seed.sql` の先頭コメントが正）。
  季節の違う時期に撮り直すときは、`seed.sql` の開催場をその時期に開いている場に直す
- スマホの幅（390px）を2倍の密度で撮る。画像の大きさ（CSS px）は `sizes.json` に書き出され、
  紹介ページの `<img>` の width / height になる
- 撮る画面を足すときは `shoot.ts` の `SHOTS` に1行足し、`LandingPage.svelte` で import する

**画面の見た目を変えたら撮り直す**（紹介ページのキャプチャが古い画面のままになる）。撮り直したら、
差分の PNG を開いて見本として崩れていないかを見る。ポートは既定で 4183（`LANDING_PORT` で変えられる）。
