# uma-memo フロントエンドの書き方

SvelteKit 3 / Svelte 5（runes）で画面とルートを書くときの約束。
ファイルの役割、画面側の書き方、フォームの受け方、コンポーネントの置き場、コードの書き方。

- 作成日: 2026-09-23 / 最終更新日: 2026-11-12
- **読む場面:** `src/routes/` の画面・ルートや `src/lib/components/` を足す・変えるとき
- **ここに無いもの:** 色・部品の選び方は [design-system.md](./design-system.md)、
  ルートごとの入出力と action の約束は [api.md](./api.md)、どの層からどこを import してよいかは
  [architecture.md 第2章](./architecture.md)、テストの書き方は [testing.md](./testing.md)

---

## 1. ファイルの役割

| ファイル | やること | やらないこと |
| --- | --- | --- |
| `+page.svelte` / `+layout.svelte` | 表示とフォームの組み立て。`data` と `form` を受け取って並べる | DB アクセス、認可の判断、業務ルール |
| `+page.server.ts` | `load`（読み）と `actions`（書き）。入力の検証、サービス層の呼び出し、リダイレクト | SQL を組むこと（サービス層へ） |
| `+server.ts` | フォームでも画面でもない HTTP（OAuth のリダイレクト、ログアウト） | 画面のデータを返すこと（`load` を使う） |
| `src/hooks.server.ts` | 認証。セッションを検証して `locals.user` を載せ、未ログインを `/login` へ送る | 画面ごとの権限（admin かどうか）はルートで見る |
| `src/lib/components/` | 画面をまたいで使う部品（競馬の語彙を持つもの） | サーバーのコードの import（型も含む） |
| `src/lib/components/ui/` | shadcn-svelte の生成物 | **手で直さない**（→ [design-system.md](./design-system.md)） |

**専用の REST API は作らない。** 読みは `load`、書きは form actions で完結させる（理由は [api.md 第1章](./api.md)）。


## 2. ルート（`+page.server.ts`）の書き方

- DB とログインユーザーは `ctx(locals)` で取り出す。admin だけの操作は `ctxAdmin`
  （`src/lib/server/util.ts`）。DB が無ければ 503、未ログインは 401、admin でなければ 403 になる
- D1 クライアントは `ctx` が作って返す。自分でモジュールスコープに置かない（→ [architecture.md 3-1](./architecture.md)）
- ルートは薄くする。画面に要る形への整形がサービス層で済むなら、そちらに寄せる
- 「誰のメモか」の絞り込みはサービス層の SQL に任せ、ルートでは絞らない。ルートで見るのは
  「その操作をしてよいか」（admin か、開催前か）だけ（→ [architecture.md 3-6](./architecture.md)）
- 型は `./$types` から取る（`PageServerLoad`・`Actions`・`PageProps`）

## 3. 画面（`+page.svelte`）の書き方

```svelte
<script lang="ts">
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const admin = $derived(isAdmin(data.user));
</script>
```

- props は `$props()`、計算で出る値は `$derived()`。`$effect()` はブラウザの API
  （`localStorage`、`beforeunload`、`IntersectionObserver`、WebMCP の登録）に触るときだけ使う
- 画面が要る型は `PageProps` の `data` から取る。**`$lib/server/**` から型を import しない**
  （SvelteKit は値の import しか止めない。層の規則は [architecture.md 第2章](./architecture.md)）
- アプリ内のリンクは `$app/paths` の `resolve('/races/[id]', { id })` で組み、`href="/..."` を直に書かない。
  GET のフォームの `action` も同じ。別のルートへ POST するフォーム（`/auth/logout`・`/settings/shares`・`/dev/mock-user`、ふりかえり画面から `/settings/insight-words?/addDefaults` へ送る `#insight-defaults`）は
  今は文字列で書いている
- クエリ付きのリンク（`/races?year=` など）は、パスを `resolve()` で組んでからクエリを足す。
  `svelte/no-navigation-without-resolve` は足した形を読めないので、その `<a>` だけを
  `<!-- eslint-disable … -->` と `<!-- eslint-enable … -->` で囲み、理由を書く
- フォームは **JavaScript が無くても動く** HTML フォームを基本にし、`use:enhance` で上乗せする
- 出走馬のように行が並ぶ一括フォームは、書きかけを失わないよう `DraftKeeper` を置く
  （未保存の件数・離脱時の確認・`localStorage` の下書き）。離脱時の確認は、読み込み直し・タブを閉じる
  （`beforeunload`）と、アプリ内のリンク（`beforeNavigate`）の両方で出す。一部の欄だけ別の経路で保存したとき（クイック入力の自動保存）は、`markSaved(values)` でその欄だけ保存済みにする
- 一括フォームの保存ボタンは `SaveBar` で出す。`DraftKeeper` の `bind:dirtyCount` を渡し、
  **未保存の変更があるときだけ**件数と一緒に出る。JS が無いときは `<noscript>` で常に出す。
  件数はメモの数で数える。欄の name は `body.<entryId>` のように `.` の後ろをメモの持ち主にそろえる
  （`utils/draft.ts` が同じメモの欄を1件にまとめる）。
  送信中は `pending`（`aria-disabled`。`disabled` にするとフォーカスが外れる）、失敗の文は `message` で
  ボタンの横に出す。`use:enhance` では送る直前に `keeper.snapshot()` を取り、成功したら `keeper.clear(sent)` に渡す
  （送信中に書き足した分を保存済みに数えない）。保存の知らせの件数は `clear()` の戻り値（変えたメモの数）を使い、
  文は `utils/note.ts` の `savedMessage`。ボタンが消えるときフォーカスはフォームへ移るので、
  フォームに `tabindex="-1"` を付ける
- `use:enhance` で値を残すフォームは **`update({ reset: false })`** を呼ぶ。既定の `update()` はフォームを
  `reset()` するが、Svelte は欄を `.value` で更新するので `defaultValue` は空のまま。リセットで全欄が空になり、
  保存した直後に中身が消えたように見える。「空欄＝そのメモを消す」フォームでは、そこで保存し直すと本当に消える
- **別のページ宛て（`action="/settings/shares"` など）の `use:enhance` で `update()` を呼ぶなら `navigate: false` を付ける。**
  SvelteKit 3 は、別ページ宛ての enhance を成功でも失敗でも宛先のページへ遷移させる（素のフォームに合わせた）。
  付けないと、失敗したとき今の画面ではなく宛先へ飛ばされる（例: `ShareControl.svelte`）。`update()` を呼ばず `result` を自分で扱うなら要らない
- 長い一覧は100件ずつ読む。サービス層は `offset` を受けて `Page<T>`（`items` と `next`）を返し、
  画面は `PagedList`（`components/paged-list.svelte.ts`）で1ページ目に続きを足して、下端に `LoadMore` を置く。
  続きは `?offset=` を付けた同じ URL の `load` を `preloadData` で読む（専用の API は作らない）。
  戻ったときに読んだ分を残すため、`export const snapshot = list.snapshot` を置く
- 「保存しました」のような一時的な知らせはトースト（`svelte-sonner` の `toast`）で出す。
  `use:enhance` の結果が `success` のときに呼ぶ。JS が無いとトーストは出ないので、同じ文を
  `<noscript>` で画面にも置く。**失敗（`form.message`）はトーストにしない。** 直すまで消えては困るので、
  `role="alert"` で残す（一括フォームでは `SaveBar` の中）

## 4. フォームと入力

- 外から来た値の検証・`fail(400, { message })`・行の構成を DB で決めること（フォームの id を鵜呑みにしない）は
  [api.md 第4章](./api.md)。画面は `form?.message` を出す
- 出走馬ごとの入力は `body.<entryId>` のように名前に id を入れて送る
- 添字付きの行（出走馬の入力）は `horseName.0` のように名前を付け、`rowCount` で件数を送る
- **hydration の前に書かれた入力は、hydration のあとに書き戻す。** Svelte は hydration で
  非制御の入力欄（`<textarea>{値}</textarea>`・`checked={値}`）を SSR の値に戻すので、JS が届く前に
  書いたものが消え、「空欄＝消す」フォームでは保存で消える。`src/app.html` のインラインスクリプトが
  入力を覚え、ルートレイアウトの onMount が書き戻して `input` / `change` を投げる
  （`src/lib/utils/early-input.ts`）。書き戻した値は `DraftKeeper` の「未保存」に数えられる。
  `bind:value` の欄も同じ扱いになるので、フォームごとに何もしなくてよい。
  今は `kit.csp` を設定していない（設定する場所は `vite.config.ts` の `sveltekit({…})`）。入れるときは、このスクリプトに nonce が要る
- **`<details>` の開閉は `bind:open` にしない。** hydration が状態の値（閉）を要素の `open` に書き込み、
  JS が届く前に開いた欄が閉じる。`open={式}` も同じ。状態が要らなければ要素の `open` を直に読み書きするだけでよい
  （`NoteMenu.svelte`）。開閉で表示を変える画面は、要素を `bind:this` で取り、onMount と `toggle` イベントで
  状態に写す。閉じるときは `details.open = false` と書き、状態もその場で揃える（`toggle` は後から届く。騎手のまとめ・重賞の傾向）。
  SSR で開いて返したいときは、属性を直に書いた `<details open>` と無い方を `{#if}` で分ける（直に書いた属性は
  hydration で触られない。重賞の傾向の「JS 無しで保存に失敗した画面」）
- フィールド名と action の一覧は [api.md 第3章](./api.md)

## 5. コンポーネント

- 置き場は `src/lib/components/`。名前は PascalCase（`GradeBadge.svelte`）。画面をまたぐ UI の状態（`paged-list.svelte.ts` のような runes のクラス）も同じ場所に置く。名前は kebab-case
- 表示と操作のテストを隣に置く（`GradeBadge.svelte.spec.ts`。書き方は [testing.md](./testing.md)）
- 色・部品の選び方・見た目の分岐の書き方は [design-system.md](./design-system.md)
- 機能ごとのディレクトリ（`components/races/` など）には、まだ分けていない（`components/` は平置き。計画は [harness.md 第2層](./harness.md)）

## 6. コードの書き方

- TypeScript は strict
- Prettier はタブ・シングルクォート・末尾カンマなし・100桁。整形で落ちたら `pnpm run format`
- SvelteKit の命名（`+page.svelte`・`+page.server.ts`・`+server.ts`）。コンポーネントは PascalCase、
  関数と変数は camelCase
- アプリ固有のヘルパーは `src/lib/utils/` に置く。`src/lib/utils.ts` は shadcn-svelte が要求する
  `cn` などのためだけのファイル
- コメントは周りに合わせて日本語で、「なぜそうしたか」を書く

## 7. 手元で触る

- 開発用のモック認証（`.dev.vars` の `MOCK_AUTH`）は [README.md](../README.md)。ヘッダの警告帯からユーザーを切り替えられる（`/dev/mock-user`。`dev` のときだけ存在する）
- 開発サーバーは手元の D1（`.wrangler/state`）を見る。PR に貼るキャプチャはこちらでは撮らない
  （→ [testing.md 第5章](./testing.md)）

## 8. WebMCP で予想の下書きを受ける

WebMCP は試験的な機能で、`/races/[id]/preview` だけが tool を登録する。仕様（tool の入出力・拒否の理由・
登録と解除の仕方）は [mcp.md 第7章](./mcp.md) が正。画面を書くときに守ることだけをここに置く。

- 登録と解除は予想ページの `$effect` で行う（mount 後に登録し、レース ID が変わる SPA 遷移と unmount で解除する）。
  非対応・登録失敗でも通常のフォームをそのまま使えるようにする
- 下書きは `DraftKeeper.apply(values)` で欄へ当てるだけで、**送信しない。** 保存は人が既存の一括保存ボタンを押したときの既存 action だけ
- 未保存件数・端末内の下書き・離脱の確認は、手入力と同じ経路（第3章の `DraftKeeper`・`SaveBar`）に乗せる
- 使い方の案内は `/help/webmcp` に置き、予想画面には置かない（試験的な機能を予想を書く画面で目立たせない）
