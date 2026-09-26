# uma-memo フロントエンドの書き方

SvelteKit 2 / Svelte 5（runes）で画面とルートを書くときの約束。
ファイルの役割、画面側の書き方、フォームの受け方、コンポーネントの置き場、コードの書き方。

- **読む場面:** `src/routes/` の画面・ルートや `src/lib/components/` を足す・変えるとき
- **ここに無いもの:** 色・部品の選び方は [design-system.md](./design-system.md)、
  ルートごとの入出力と action の約束は [api.md](./api.md)、どの層からどこを import してよいかは
  [architecture.md 第2章](./architecture.md)、テストの書き方は [testing.md](./testing.md)
- 作成日: 2026-09-23 — AGENTS.md の「コードの書き方」と、各所に散っていた SvelteKit の決まりを集めた

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

- DB とログインユーザーは `ctx(locals, platform)` で取り出す。admin だけの操作は `ctxAdmin`
  （`src/lib/server/util.ts`）。DB が無ければ 503、未ログインは 401、admin でなければ 403 になる
- D1 クライアントはリクエストごとに作る。`ctx` が `createDb(platform.env, locals.monitor.onQuery)` で作って返すので、
  自分でモジュールスコープに置かない（→ [architecture.md 3-1](./architecture.md)）
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
  （`localStorage`、`beforeunload`）に触るときだけ使う。今は `DraftKeeper` の中にしか無い
- 画面が要る型は `PageProps` の `data` から取る。**`$lib/server/**` から型を import しない**
  （SvelteKit は値の import しか止めない。層の規則は [architecture.md 第2章](./architecture.md)）
- アプリ内のリンクは `$app/paths` の `resolve('/races/[id]', { id })` で組み、`href="/..."` を直に書かない。
  GET のフォームの `action` も同じ。別のルートへ POST するフォーム（`/auth/logout`・`/settings/shares`）は
  今は文字列で書いている
- クエリ付きのリンク（`/races?year=` など）は、パスを `resolve()` で組んでからクエリを足す。
  `svelte/no-navigation-without-resolve` は足した形を読めないので、その `<a>` だけを
  `<!-- eslint-disable … -->` と `<!-- eslint-enable … -->` で囲み、理由を書く
- フォームは **JavaScript が無くても動く** HTML フォームを基本にし、`use:enhance` で上乗せする
- 出走馬のように行が並ぶ一括フォームは、書きかけを失わないよう `DraftKeeper` を置く
  （未保存の件数・離脱時の確認・`localStorage` の下書き）。離脱時の確認は、読み込み直し・タブを閉じる
  （`beforeunload`）と、アプリ内のリンク（`beforeNavigate`）の両方で出す
- 一括フォームの保存ボタンは `SaveBar` で出す。`DraftKeeper` の `bind:dirtyCount` を渡し、
  **未保存の変更があるときだけ**件数と一緒に出る。JS が無いときは `<noscript>` で常に出す。
  件数はメモの数で数える。欄の name は `body.<entryId>` のように `.` の後ろをメモの持ち主にそろえる
  （`utils/draft.ts` が同じメモの欄を1件にまとめる）。
  送信中は `pending`（`aria-disabled`。`disabled` にするとフォーカスが外れる）、失敗の文は `message` で
  ボタンの横に出す。`use:enhance` では送る直前に `keeper.snapshot()` を取り、成功したら `keeper.clear(sent)` に渡す
  （送信中に書き足した分を保存済みに数えない）。保存の知らせの件数は `clear()` の戻り値（変えたメモの数）を使い、
  文は `utils/note.ts` の `savedMessage`。ボタンが消えるときフォーカスはフォームへ移るので、
  フォームに `tabindex="-1"` を付ける
- 「保存しました」のような一時的な知らせはトースト（`svelte-sonner` の `toast`）で出す。
  `use:enhance` の結果が `success` のときに呼ぶ。JS が無いとトーストは出ないので、同じ文を
  `<noscript>` で画面にも置く。**失敗（`form.message`）はトーストにしない。** 直すまで消えては困るので、
  `role="alert"` で残す（一括フォームでは `SaveBar` の中）

## 4. フォームと入力

- 外から来た値（`FormData`・クエリ文字列）は、`src/lib/schemas/` の Valibot スキーマで型付きの値にしてから使う。
  `v.safeParse` の失敗は `fail(400, { message })` で返し、画面は `form?.message` を出す
- **行の構成はフォームではなく DB を正とする。** 出走馬ごとの入力は `body.<entryId>` のように
  名前に id を入れて送るが、どの `entryId` を読むかは DB から引いた出走馬の一覧で決める。
  フォームの id を鵜呑みにすると、他のレースの行に書き込めてしまう
- 添字付きの行（出走馬の入力）は `horseName.0` のように名前を付け、`rowCount` で件数を送る
- **hydration の前に書かれた入力は、hydration のあとに書き戻す。** Svelte は hydration で
  非制御の入力欄（`<textarea>{値}</textarea>`・`checked={値}`）を SSR の値に戻すので、JS が届く前に
  書いたものが消え、「空欄＝消す」フォームでは保存で消える。`src/app.html` のインラインスクリプトが
  入力を覚え、ルートレイアウトの onMount が書き戻して `input` / `change` を投げる
  （`src/lib/utils/early-input.ts`）。書き戻した値は `DraftKeeper` の「未保存」に数えられる。
  `bind:value` の欄も同じ扱いになるので、フォームごとに何もしなくてよい。
  `kit.csp` を入れるときは、このスクリプトに nonce が要る
- フィールド名と action の一覧は [api.md 第3章](./api.md)

## 5. コンポーネント

- 置き場は `src/lib/components/`。名前は PascalCase（`GradeBadge.svelte`）
- 表示と操作のテストを隣に置く（`GradeBadge.svelte.spec.ts`。書き方は [testing.md](./testing.md)）
- 色・部品の選び方・見た目の分岐の書き方は [design-system.md](./design-system.md)
- 機能ごとのディレクトリ（`components/races/` など）に分ける計画がある（[harness.md 第2層](./harness.md)）

## 6. コードの書き方

- TypeScript は strict
- Prettier はタブ・シングルクォート・末尾カンマなし・100桁。整形で落ちたら `pnpm run format`
- SvelteKit の命名（`+page.svelte`・`+page.server.ts`・`+server.ts`）。コンポーネントは PascalCase、
  関数と変数は camelCase
- アプリ固有のヘルパーは `src/lib/utils/` に置く。`src/lib/utils.ts` は shadcn-svelte が要求する
  `cn` などのためだけのファイル
- コメントは周りに合わせて日本語で、「なぜそうしたか」を書く

## 7. 手元で触る

- `.dev.vars` に `MOCK_AUTH="1"` を置いて `pnpm run dev`。Google に行かずにログインでき、
  ヘッダの警告帯からユーザーを切り替えられる（`/dev/mock-user`。`dev` のときだけ存在する）
- 開発サーバーは手元の D1（`.wrangler/state`）を見る。PR に貼るキャプチャはこちらでは撮らない
  （→ [testing.md 第5章](./testing.md)）
