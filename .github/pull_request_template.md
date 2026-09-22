## 何を変えたか

<!-- 変えたものを箇条書きで。ファイルが多いときは表にする。 -->

## なぜ

<!-- 直前に何が起きていて、それがなぜ困るのか。直し方より先に理由を書く。 -->

## 画面

<!--
見た目か画面遷移が変わったなら、変更後のキャプチャを貼る（既存画面の修正なら before / after）。
docs/screenshots/ にコミットしてから、コミット SHA の raw URL で貼ること（ブランチ名は使わない）:
![説明](https://raw.githubusercontent.com/Atoyr/keiba-note/<コミットSHA>/docs/screenshots/<file>.png)

UI を触っていない変更（データ登録・CI・docs・サーバー内部）は、
代わりに実行ログや CI の run へのリンクを貼る。この欄は空にしない。
-->

## レビューで見てほしいところ

<!-- 判断が割れそうな箇所、決めを入れた箇所、あとで効いてくる箇所。無ければ「特になし」。 -->

## 確認したこと

- [ ] 単体テストを追加・更新した（省いたなら理由: ）
- [ ] E2E を追加・更新した（省いたなら理由: ）
- [ ] `pnpm run check`
- [ ] `pnpm run lint`
- [ ] `pnpm run test:unit -- --run`
- [ ] `pnpm run test:e2e`（全部 green。`.only` や `test.skip` を残していない）
- [ ] `data/` を触ったなら `pnpm run data:check`

<!-- 出力を貼れるものは貼る。落ちたまま出すときは、どこが落ちているかを書く。 -->
