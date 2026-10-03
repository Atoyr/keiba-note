# AGENTS.md

uma-memo（旧名 k-note）は競馬の観戦メモを残してふりかえる Web アプリ。SvelteKit 2 / Svelte 5（runes）を
Cloudflare Workers + D1 で動かしている。Worker・D1・リポジトリの名前は旧名のまま（→ [operations.md](./docs/operations.md#名前について)）。

**このファイルは知識の目次。** コードを変える人と AI エージェントが最初に読み、ここから
いま触る分野の文書だけを開く。詳細はここに書かず、下の文書に1つずつ置く（→ [harness.md 第7章](./docs/harness.md)）。

## 目指す状態

変更の実装を依頼されたら、原則として **人が成果物を見て判断できる PR** まで進める。
調査・説明・レビューだけの依頼は結果の報告で完了する。ユーザーが成果物や作業範囲を指定した場合は、その指定を優先する。
実装依頼の完了条件は次の5つ。検証を完了できない場合は [testing.md 1-2](./docs/testing.md#1-2-検証を完了できないとき) に従い、未完了として引き継ぐ。

- `pnpm run verify` が green（型・lint・単体テスト・E2E）
- 見た目が変わった画面の before / after が PR 本文の「画面」に貼られている
- [evaluation.md 第0章](./docs/evaluation.md#0-評価が必要な変更) に従い、「評価」に Evaluator の結果と残る `✗` の理由、または対象外の理由がある
- [review.md 第0章](./docs/review.md#0-いつ頼むか) に従い、「コードレビュー」に `review:plan` が選んだレビュアーの結果と、採らない `必須` の理由がある（重の `必須` が直っていなければ Draft。[review.md 第3章](./docs/review.md#3-手順)）
- 判断を入れた箇所が PR 本文の「レビューで見てほしいところ」に書かれている

途中で止めて確認を求めてよいのは、次のときだけ。それ以外は、妥当な判断をして進める。

- 指示の読み方で、できあがる画面や挙動が大きく変わるとき
- [architecture.md 第0章「守ること」](./docs/architecture.md)を破らないと実現できないとき
- 本番のデータ・D1・シークレット・デプロイに触る必要があるとき
- 消す・履歴を書き換える（force push）・リポジトリの外を変えるなど、取り消しにくい操作の前

## 知識の目次

```
AGENTS.md
│
├── architecture → docs/architecture.md
├── frontend     → docs/frontend.md
├── design       → docs/design-system.md
├── testing      → docs/testing.md
├── api          → docs/api.md
├── evaluation   → docs/evaluation.md
└── review       → docs/review.md
```

| 分野         | 文書                                             | 何が書いてあるか                                                                  | 開く場面                                       |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| architecture | [docs/architecture.md](./docs/architecture.md)   | **第0章 守ること**（ランタイム・DB とデータ）、層と機能の依存の向き、D1 の使い方  | 毎回 第0章。サーバー側・DB・依存を触るとき全体 |
| frontend     | [docs/frontend.md](./docs/frontend.md)           | ファイルの役割、Svelte 5 の書き方、フォームと入力、コンポーネント、コードの書き方 | 画面・ルート・コンポーネントを触るとき         |
| design       | [docs/design-system.md](./docs/design-system.md) | トークン、shadcn の部品、ドメイン部品、大きさと文言                               | 見た目を触るとき                               |
| testing      | [docs/testing.md](./docs/testing.md)             | テストの置き場と約束、E2E の環境、画面カタログ、キャプチャ                        | 毎回（テストを書く・確かめる・撮る）           |
| api          | [docs/api.md](./docs/api.md)                     | ルートと action の一覧、認証、action の約束、サービス層の関数の約束               | ルート・action・サービス関数を足す・変えるとき |
| evaluation   | [docs/evaluation.md](./docs/evaluation.md)       | Generator と Evaluator の分け方、評価の観点、返す形                               | PR の前に評価を頼むとき・評価するとき          |
| review       | [docs/review.md](./docs/review.md)               | 分野ごとのレビュアー（YAML・SQL・フロント・AI プロンプト）、重さの決め方、観点    | PR の前にレビューを頼むとき・レビューするとき  |

ほかに、必要なときだけ読むもの:

| 文書                                                                              | 何が書いてあるか                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [README.md セットアップ](./README.md#セットアップ)                                | 初回の検証準備（Node・pnpm・依存関係・Chromium）                 |
| [docs/product.md](./docs/product.md)                                              | 何を・なぜ作るか（要件・データモデル・画面の仕様・やらないこと） |
| [docs/harness.md](./docs/harness.md)                                              | この仕組み全体の設計（6層・コンテキスト・これから入れる規則）    |
| [docs/operations.md](./docs/operations.md) / [docs/staging.md](./docs/staging.md) | Cloudflare の構築・本番デプロイ / ステージングの更新             |
| [docs/monitoring.md](./docs/monitoring.md)                                        | ログ・Discord への通知・死活監視（ログやエラー処理を触るとき）   |
| [data/README.md](./data/README.md)                                                | 出走馬データ（YAML）の書式と投入                                 |

## 作業の手順

1. **読む・準備する。** 関係するコード・テスト・分野の文書と product.md の該当章。Dev Container または [README.md の同等環境](./README.md#セットアップ)で作業し、初回は `pnpm install --frozen-lockfile` → `pnpm run setup` を実行する
2. **before を撮る。** 画面に関わる変更なら、手を入れる前に `pnpm run screens <機能名> before`
   （→ [testing.md 第5章](./docs/testing.md)）
3. **実装する。** テストも同時に書く。画面や見せたい状態が増えたら `e2e/screens.ts` に1行足す
4. **`pnpm run verify` を通す。** 今回の変更による失敗は直して回し直す。切り分けと未検証時の出口は [testing.md 1-2](./docs/testing.md#1-2-検証を完了できないとき)
5. **after を撮って、自分で見る。** `pnpm run screens <機能名> after`。残った画像を開いて、
   指示どおりか・崩れていないかを確かめる。違えば 3 に戻る
6. **レビューと評価を頼む。** `pnpm run review:plan` が選んだレビュアー（[review.md](./docs/review.md)）と、[evaluation.md 第0章](./docs/evaluation.md) で必要なら
   Evaluator を並行で起動する。`必須` と `✗` を事実を確かめて直し、4 から回す。2往復まで。評価を対象外にできる場合は理由を書く
7. **PR を出す。** `pnpm run screens:pr <機能名>` の出力を「画面」に、評価を「評価」に、レビューを「コードレビュー」に貼る。
   キャプチャはコミットしない（`screens:pr` が画像置き場の `screenshots` ブランチへ上げる。→ [testing.md 5-2](./docs/testing.md)）

画面に影響しない変更は 2 と 5 を飛ばし、代わりに実行ログを PR に貼る。評価の要否は別に判断する。
長い作業は、進み具合と残りを `TASKS.md`（リポジトリ直下。コミットしない）に書きながら進める。
会話が要約されても、そこから続きを拾える。

## 読み落とすと事故になること

詳細と理由はリンク先。見出しだけここに置く。

- メモを読む関数は `viewerId` を必須で受け、WHERE に `author_id = :viewer` を入れる（[architecture.md 第0章](./docs/architecture.md)）
- 認証は `hooks.server.ts` だけが判断する。ログイン不要のパスは `PUBLIC_PATHS` だけ。`/mcp` は Bearer だけ・Bearer は `/mcp` だけ（例外と理由は [architecture.md 第0章](./docs/architecture.md)）
- 画面側はサーバーのコードを型ですら import しない。サービス層は SvelteKit を import しない（[architecture.md 第2章](./docs/architecture.md)）
- `src/lib/components/ui/` と `drizzle/` の生成物は手で直さない（[design-system.md](./docs/design-system.md) / [architecture.md 第0章](./docs/architecture.md)）
- 本番の D1（`--remote`）・`wrangler secret`・`deploy` は叩かない。人が行う
- キャプチャに実在のメールアドレスや本番データを写さない。`pnpm run screens` で撮る（[testing.md 5-4](./docs/testing.md)）

## コマンド

```bash
pnpm run setup                          # 初回に Chromium と OS 依存パッケージを準備
pnpm run verify                         # check / lint / test（単体テスト + E2E）を全部
pnpm run test:unit                      # 単体テストを1回
pnpm run test:watch                     # 単体テストを監視して再実行
pnpm run test:e2e                       # E2E だけ（ビルドから走る）
pnpm run screens <機能名> before|after   # PR 用キャプチャ（画面名を並べれば絞れる）
pnpm run screens:pr <機能名>            # キャプチャを screenshots ブランチへ上げ、PR 本文に貼る Markdown を出す
pnpm run landing:shots                  # 紹介ページ（未ログインの /）に載せるキャプチャを撮り直す（testing.md 第8章）
pnpm run data:check                     # data/ を触ったとき
pnpm run data:fetch <手順> <日付> <場> <R> # netkeiba から data/races/*.yaml を書く（data/README.md）
pnpm run odds:update --local            # オッズの更新を手元の D1 で1回（本番は odds-update.yml。architecture.md 3-8）
pnpm run review:plan                    # PR の前に起動するレビュアーと重さを差分から出す（docs/review.md）
pnpm run docs:check                     # 文書のリンクと目次（lint に入っている）
pnpm run course-maps                    # コース図の SVG を src/lib/utils/course.ts から書き出す
pnpm run og-font                        # 共有の画像のフォント（static/og/）を書き出す（architecture.md 3-7）
```

## コミットと PR

- コミットは Conventional Commits の接頭辞（`feat:`・`fix:`・`docs:` など）と日本語の要約。1コミット1目的
- PR は `.github/pull_request_template.md` の見出しを日本語で埋める。「なぜ」と
  「レビューで見てほしいところ」を具体的に書く
- **画面**欄は空にしない。UI の変更は `screens:pr` の出力、それ以外はテストの結果・`data:check` の出力・CI の run へのリンク
- `data/` を触った PR は、マージで本番に投入されることを本文に書く（[architecture.md 第0章](./docs/architecture.md)）
- 検証の省略・失敗・未検証は [testing.md 1-2](./docs/testing.md#1-2-検証を完了できないとき) に従って記録する。理由の記載だけで完了にはしない
- 文書を足したら、この目次に足す
