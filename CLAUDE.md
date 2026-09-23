# k-note

SvelteKit + Cloudflare Workers/D1 の競馬メモアプリ。
何のためのアプリかは [README.md](./README.md)、設計の理由は
[docs/design.md](./docs/design.md) と [docs/architecture.md](./docs/architecture.md) にある。
守るべきランタイム上の約束（`viewerId` の必須化、D1 クライアントの生成場所など）は
README の「ランタイム上の約束」にまとまっている。**先にそこを読むこと。**

## コードを変えたら、ここまでやって初めて完了

単体テスト・E2E・キャプチャの3つが揃うまでは「終わった」と言わない。
どれかを省いたときは、**省いた理由を PR 本文に書く**（黙って飛ばさない）。

### 1. 単体テスト（Vitest）を書く

| 対象                  | 置き場                    | 実行環境               |
| --------------------- | ------------------------- | ---------------------- |
| サーバー・純ロジック  | `src/**/*.spec.ts`        | node                   |
| Svelte コンポーネント | `src/**/*.svelte.spec.ts` | chromium（実ブラウザ） |

- 追加・変更した分岐を必ず1本は通す。とくに **権限で絞る条件・リダイレクト先の
  組み立て・日付の境界** は、間違えると他人のメモの露出に直結するので落とさない。
- `expect.requireAssertions` が有効。アサーションの無いテストは失敗する。
- 実行: `pnpm run test:unit -- --run`

### 2. E2E（Playwright）を終える

- 置き場は `e2e/*.e2e.ts`（`testMatch` が `**/*.e2e.{ts,js}`）。
- webServer が `npm run build && npm run preview` を上げるので**本番ビルド相当**で走る。
  CSRF 検証が効くのはここだけなので、form POST を足したら E2E で確かめる。
- **画面・ルーティング・認可のいずれかを触ったら、E2E を1本足すか既存を更新する。**
  未ログインで開けてしまわないか、他人の id で開けてしまわないかを見る。
  未ログインの確認は `e2e/auth.e2e.ts` の `PROTECTED` に1行足す（認証は hooks で一律なので、
  画面ごとに別のテストを書かない）。
- DB を引く画面を足したときは、先に `pnpm run db:migrate:local`（ローカル D1 は
  `.wrangler/state` の使い捨て）。
- 実行: `pnpm run test:e2e`。**全部 green が「完了」**。`.only` や `test.skip` を残さない。

### 3. 検証コマンドを全部通す

```bash
pnpm run check
pnpm run lint
pnpm run test:unit -- --run
pnpm run test:e2e
```

CI（`.github/workflows/ci.yml`）が同じものを回す。ローカルで落ちるものは push しない。
`data/` を触ったときは `pnpm run data:check` も。

### 4. PR に修正した内容のキャプチャを貼る

**見た目か画面遷移が変わる変更は、変更後の画面を PR 本文に必ず貼る。**
既存画面の修正なら before / after を並べる。

1. **撮る** — `.dev.vars` に `MOCK_AUTH="1"` を置いて `pnpm run dev`、該当画面を撮る。
   実在のメールアドレスや実データを写さない（このリポジトリは public）。
2. **コミットする** — `docs/screenshots/<機能名>.png` に置いて push する。
   `docs/` は prettier の対象外なので整形は不要。
3. **コミット SHA の raw URL で貼る** — PR 本文では相対パスの画像は表示されない。

   ```markdown
   ![予想画面](https://raw.githubusercontent.com/Atoyr/keiba-note/<コミットSHA>/docs/screenshots/phase5/preview-umabashira.png)
   ```

   **ブランチ名ではなく SHA を使う。** ブランチ名にすると、あとで push したときに
   PR に貼った画像まで差し替わり、ブランチを消すと画像ごと消える。
   画像を push してから `git rev-parse HEAD` で URL を組み立てる。

UI を触らない変更（データ登録・CI・docs・サーバー内部）はキャプチャの代わりに
**実行ログ**（`pnpm run data:check` の出力、テストの結果、CI の run へのリンク）を貼る。
何も貼らない PR は無し。

## PR の書き方

`.github/pull_request_template.md` の見出しを埋める。日本語で書く。
「なぜ」と「レビューで見てほしいところ」は埋めるほど通りが早い。
`data/` への変更はリリースを待たず `data-import.yml` が本番に投入するので、
その旨を本文に書いておく。
