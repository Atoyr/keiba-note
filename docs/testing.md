# uma-memo のテストと確かめ方

変更をどう確かめるか。テストの置き場と書き方、E2E の環境、画面カタログ、
PR に貼るキャプチャの撮り方。

- **読む場面:** コードを変えるときは毎回（テストを書く・`verify` を通す・キャプチャを撮る）
- **ここに無いもの:** 仕組みをなぜこう組んだか・これから足す検査は [harness.md 第5層](./harness.md)、
  ルートごとの入出力は [api.md](./api.md)
- 作成日: 2026-09-23 — AGENTS.md の「テスト」と、harness.md の検証の仕組みの説明を移した

---

## 1. 何を、どこで確かめるか

| 確かめること | 仕組み | 置き場 | 落ちるコマンド |
| --- | --- | --- | --- |
| 型・Svelte の検査 | `svelte-check` | — | `pnpm run check` |
| 整形・lint・文書の参照 | Prettier / ESLint / `scripts/check-docs.ts` | — | `pnpm run lint` |
| サーバー・サービス層・純ロジック・権限の絞り込み・日付の境界 | Vitest（node） | `src/**/*.spec.ts` | `pnpm run test:unit` |
| Svelte コンポーネントの表示と操作 | Vitest（実 chromium） | `src/**/*.svelte.spec.ts` | 同上 |
| `scripts/` の道具（netkeiba の読み取り・YAML への当てはめなど） | Vitest（node） | `scripts/**/*.spec.ts` | 同上 |
| 画面の振る舞い・認可・form POST（CSRF） | Playwright（本番ビルド + E2E 専用 D1） | `e2e/*.e2e.ts` | `pnpm run test:e2e` |
| 全画面が開けること・実行時エラー・mobile ではみ出さないこと | 画面カタログ | `e2e/screens.ts`（1行足す） | 同上 |
| PR 本文の欄（画面・評価など）が埋まっているか | `scripts/check-pr-body.ts` | `.github/workflows/pr-body.yml` | CI の「PR 本文」（手元では `pnpm run pr:check`） |
| 頼まれたものか・使いやすいか | **Evaluator**（書いたのとは別のエージェント） | [evaluation.md](./evaluation.md) | PR 本文の「評価」に ✗ が残る |
| 見た目が意図どおりか | **人**がキャプチャを見る | `docs/screenshots/<機能名>/` | PR で差し戻す |

上の6行は `pnpm run verify`（check → lint → 単体 → E2E）に入っている。
CI（`.github/workflows/ci.yml`）も同じものを回し、画面カタログのキャプチャを artifact `screens` として上げる。
`verify` と `screens` はビルドを含むので数分かかる。

## 2. テストを書くときの約束

- **足した・変えた分岐は1本以上テストを通す。** 権限で絞る条件・リダイレクト先の組み立て・
  日付の境界は特に落とさない。ここを間違えると他人のメモが見えてしまう
- **画面・ルーティング・認可を触ったら E2E を足すか直す。** 未ログインで開けないこと、
  他人の id で開けないことを見る。未ログインの確認は `e2e/auth.e2e.ts` の `PROTECTED` に1行足す
  （認証は hooks で一律に効くので、画面ごとに別のテストを書かない）
- **form POST を足したら E2E で確かめる。** CSRF の検証は本番ビルドでしか効かない（`vite dev` では通ってしまう）
- **E2E で入力欄に書く・送信する前は hydration を待つ。** `gotoHydrated` か `waitForHydration`
  （`e2e/hydration.ts`）を使う。`page.goto` が待つのは load までで、hydration はそのあとに走る。
  先に書いた値は hydration のあとに書き戻される（[frontend.md 第4章](./frontend.md)）が、済む前に
  送信すると `use:enhance` の無い送信になり、`DraftKeeper` もまだ動いていない。並列で JS の配信が
  遅れたときだけ違う経路を通るので、待って揃える。印はルートレイアウトの onMount が `<html data-hydrated>` に立てる
- `expect.requireAssertions` が有効。アサーションの無いテストは落ちる
- `.only` と `test.skip` は残さない
- コンポーネントのテストは対象の隣に置く（`GradeBadge.svelte` → `GradeBadge.svelte.spec.ts`）

## 3. E2E の環境

### 3-1. 専用の D1 — `.wrangler/e2e`

E2E のプレビューサーバー（`playwright.config.ts` の webServer）は `wrangler dev --persist-to .wrangler/e2e`
で上がり、開発用の `.wrangler/state` とは別の D1 を見る。**開発用 D1 の中身は E2E に関係しない。**

以前は同じ D1 を共有していたため、手元で `data:import:local` した本物の出馬表や
`pnpm run dev` で書いたメモが E2E とキャプチャに混ざっていた。これでは人によって結果が変わり、
before / after の比較も成り立たない。

webServer の command の先頭で `e2e/seed.ts` が毎回、次の順で状態を作り直してから、ビルドと `wrangler dev` に進む。

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
- 日付に依存する画面（ダッシュボードの「今週」など）は `date('now', '+9 hours', ...)` で
  seed を流した日から決める。未来であり続けてほしい行は 2099 年に置く
- 撮るのに要る行が無ければ seed に足す

## 4. 画面カタログ — `e2e/screens.ts`

人がキャプチャで確かめる画面の一覧。1画面（または1状態）1行。

```ts
{ name: 'race-preview-editing', path: `/races/${PREVIEW_RACE_ID}/preview`, auth: true,
  prepare: async (page) => { await page.getByText('書き直す', { exact: true }).click(); } }
```

- `name` はファイル名になる（英小文字とハイフン）
- `prepare` で「開いた」「入力した」などの状態にしてから撮る。同じ URL の別状態は別の行にする
- `screens.e2e.ts` がこれを desktop（1280px）と mobile（390px）の2幅で開き、
  応答が 400 未満であること・ログイン画面に飛ばされないこと・`pageerror` と `console.error` が
  無いこと・mobile で横にはみ出さないことを確かめてから、全体を撮る

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
2026-09-24 までは作業ブランチにコミットしていた。そのころの PR の画像は、当時のコミット SHA の URL なので
main から消したあとも見える。

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

- **admin の画面は `/settings/admin` だけがカタログにある。** seed に admin のユーザーとセッション
  （`ADMIN_SESSION_TOKEN`）があり、`Screen` の `as: 'admin'` で開く。`/races/new`・`/races/[id]/entries` も
  同じように1行足せば撮れる
- **GitHub Actions を起動するところ（出走馬の取得）は E2E では確かめない。** E2E はトークンを渡さない
  （`playwright.config.ts` の `--var GITHUB_DISPATCH_TOKEN:`）ので、見るのは「押せない」「直接送っても断る」まで。
  GitHub に送る中身は `lib/server/race-data/dispatch.spec.ts` で見る
- **開発サーバーにしか無い経路**（モック認証の警告帯・ユーザー切り替え）は本番ビルドに無いので撮れない
- 見た目の回帰を自動で止める仕組み（`toHaveScreenshot` の基準画像のコミット）は入れていない。
  OS ごとに基準画像が要り、見た目を変えるたびに更新の手間がかかる割に、この規模では
  人が before / after を見るほうが安い。変わった画面だけを出す仕組みで代えている
