# AGENTS.md

k-note は競馬の観戦メモを残してふりかえる Web アプリ。SvelteKit 2 / Svelte 5（runes）を
Cloudflare Workers + D1 で動かしている。このファイルは、コードを変える人と AI エージェントが
共通で従う約束と手順をまとめたもの。何を作っているかは [README.md](./README.md)、
設計の理由は [docs/design.md](./docs/design.md) と [docs/architecture.md](./docs/architecture.md)、
変更の確かめ方の仕組みは [docs/harness.md](./docs/harness.md) にある。

## 目指す状態

指示を受けたら、**人がキャプチャを見て判断するだけの状態の PR** まで持っていく。
型・lint・単体テスト・E2E は全部通っていて、見た目が変わった画面の before / after が
PR 本文に貼られている状態のこと。機械で確かめられることを人に残さない。

途中で止めて確認を求めてよいのは、次のときだけ。それ以外は、妥当な判断をして進め、
その判断を PR 本文の「レビューで見てほしいところ」に書く。

- 指示の読み方で、できあがる画面や挙動が大きく変わるとき
- 下の「ランタイム上の約束」を破らないと実現できないとき
- 本番のデータ・D1・シークレット・デプロイに触る必要があるとき

## 作業の手順

1. **読む。** 触る画面の `+page.svelte` / `+page.server.ts`、呼んでいるサービス層、既存のテスト。
   関係する設計があれば design.md の該当章も
2. **before を撮る。** 画面に関わる変更なら、手を入れる前に
   `pnpm run screens <機能名> before` を実行する（機能名は英小文字とハイフン）。
   あとからは撮れないので、最初にやる
3. **実装する。** テストも同時に書く（次節）。新しい画面や、見せたい状態（開いた・入力した）が
   増えたら `e2e/screens.ts` に1行足す。撮るのに要る行が無ければ `e2e/seed.sql` に足す
4. **`pnpm run verify` を通す。** check → lint → 単体テスト → E2E を順に回す。
   落ちたら直して、最初から回し直す。整形で落ちたら `pnpm run format`
5. **after を撮って、自分で見る。** `pnpm run screens <機能名> after`。
   見た目が変わらなかった画面は自動で消え、変わった画面だけが残る。
   残った画像を開いて、指示どおりか・崩れていないか（はみ出し、重なり、mobile での折り返し、
   意図しない画面まで変わっていないか）を確かめる。違えば 3 に戻る
6. **PR を出す。** キャプチャをコミットして push し、`pnpm run screens:pr <機能名>` の出力を
   PR 本文の「画面」に貼る（下の「PR」）

UI に関わらない変更（サーバー内部・データ・CI・docs）は 2 と 5 を飛ばし、代わりに
実行ログを PR に貼る。

## テスト

| 対象                                 | 置き場                            | 実行環境                 |
| ------------------------------------ | --------------------------------- | ------------------------ |
| サーバー・サービス層・純ロジック     | `src/**/*.spec.ts`                | node                     |
| Svelte コンポーネント                | `src/**/*.svelte.spec.ts`         | 実 chromium              |
| 画面の振る舞い・認可・form POST      | `e2e/*.e2e.ts`                    | 本番ビルド + E2E 専用 D1 |
| 全画面が開けること・エラー・はみ出し | `e2e/screens.ts`（カタログに1行） | 同上                     |

- 足した・変えた分岐は1本以上テストを通す。**権限で絞る条件・リダイレクト先の組み立て・
  日付の境界**は特に落とさない。ここを間違えると他人のメモが見えてしまう
- 画面・ルーティング・認可を触ったら E2E を足すか直す。未ログインで開けないこと、
  他人の id で開けないことを見る。未ログインの確認は `e2e/auth.e2e.ts` の `PROTECTED` に1行足す
  （認証は hooks で一律に効くので、画面ごとに別のテストを書かない）
- form POST を足したら E2E で確かめる。CSRF 検証は本番ビルドでしか効かない（`vite dev` では通ってしまう）
- E2E で入力欄に書く・送信する前は、`gotoHydrated` か `waitForHydration`（`e2e/hydration.ts`）で
  hydration を待つ。待たずに書くと、hydration が SSR の値で上書きして空のまま保存される。
  並列で回したときだけ落ちるので、1ファイルだけ回しても気づけない
- `expect.requireAssertions` が有効。アサーションの無いテストは落ちる
- `.only` と `test.skip` は残さない
- E2E は `.wrangler/e2e` の専用 D1 を毎回空にして seed から作り直す。開発用 D1 の中身は関係しない

## ランタイム上の約束

破ると本番で他人のメモが漏れるか、Workers で壊れるもの。理由ごと覚えておくこと。

- **メモを読む関数は `viewerId` を必須引数で受け取り、SQL の WHERE に `author_id = :viewer` を入れる。**
  省略可能にした時点で、絞り忘れが「全ユーザーに見える」に直結する。
  `visibility` を見てよいのは共有ページ `/notes/[id]` だけ
- **D1 クライアントはリクエストごとに `createDb(platform.env)` で作る。** モジュールスコープに
  接続やユーザー情報を持たせない。Workers の実行環境は複数のリクエストで使い回される
- **認証の判断は `src/hooks.server.ts` に閉じる。** ルートは `locals.user` だけを見る。
  ログイン不要のパスは `PUBLIC_PATHS` にあるものだけ
- **サービス層（`src/lib/server/services/`）は SvelteKit を import しない。** テストでき、
  ルート以外からも呼べるようにするため
- 1リクエストの D1 クエリは10以内（Free の上限は50）。超えそうなら JOIN か `batch()` にまとめる
- **セッショントークンは DB に平文で入れない。** 保存するのは SHA-256 ハッシュだけ
- `nodejs_compat` は付けない（起動コストとバンドルが増える。採用ライブラリは Web 標準 API で動く）。
  `compatibility_date` は意図して上げるとき以外は変えない
- モック認証（`MOCK_AUTH`）は `dev` ガードの中にだけ置く。本番ビルドから分岐ごと消えるのが前提

## DB とデータ

- スキーマの正は `src/lib/server/db/schema.ts`。マイグレーションは `pnpm run db:generate` で作り、
  生成された `drizzle/*.sql` と `drizzle/meta/` は手で直さない。生成物も一緒にコミットする
- 出走馬データは画面からではなく `data/races/*.yaml` で入れる。書式は [data/README.md](./data/README.md)。
  触ったら `pnpm run data:check` を通す。`main` にマージされるとリリースを待たずに
  `data-import.yml` が本番に投入するので、PR 本文にその旨を書く
- 本番の D1（`--remote`）、`wrangler secret`、`deploy` は人が行う。エージェントからは叩かない

## コードの書き方

- TypeScript は strict。Prettier はタブ・シングルクォート・末尾カンマなし・100桁
- SvelteKit の命名（`+page.svelte`・`+page.server.ts`・`+server.ts`）。コンポーネントは PascalCase、
  関数と変数は camelCase
- 入力の検証は Valibot（`src/lib/schemas/`）。`src/lib/components/ui/` は shadcn-svelte の生成物なので手を入れない
- コメントは周りに合わせて日本語で、「なぜそうしたか」を書く

## コマンド

```bash
pnpm run verify                         # check / lint / test:unit / test:e2e を全部
pnpm run test:unit -- --run             # 単体テストだけ
pnpm run test:e2e                       # E2E だけ（ビルドから走る）
pnpm run screens <機能名> before|after   # PR 用キャプチャ（画面名を並べれば絞れる）
pnpm run screens:pr <機能名>            # PR 本文に貼る Markdown
pnpm run data:check                     # data/ を触ったとき
```

手元で画面を触って見たいときは、`.dev.vars` に `MOCK_AUTH="1"` を置いて `pnpm run dev`。
PR に貼るキャプチャはこちらではなく `pnpm run screens` で撮る（誰が撮っても同じ画像になるため）。

## コミットと PR

- コミットは Conventional Commits の接頭辞（`feat:`・`fix:`・`docs:` など）と日本語の要約。1コミット1目的
- PR は `.github/pull_request_template.md` の見出しを日本語で埋める。「なぜ」と
  「レビューで見てほしいところ」を具体的に書くほど通りが早い
- **画面**欄には `pnpm run screens:pr <機能名>` の出力を貼る。画像の URL はコミット SHA で組まれる
  （ブランチ名だと、あとの push や削除で PR の画像が変わる・消える）。
  UI に関わらない変更は、テストの結果・`data:check` の出力・CI の run へのリンクを貼る。この欄は空にしない
- キャプチャに実在のメールアドレスや本番データを写さない（このリポジトリは public）。
  `pnpm run screens` は seed のデータだけで撮るので、これを使えば守られる
- 検証を省いたときは、省いたものと理由を PR 本文に書く
