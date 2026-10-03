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
  （`localStorage`、`beforeunload`、`IntersectionObserver`、WebMCP の登録）に触るときだけ使う
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
- 長い一覧は100件ずつ読む。サービス層は `offset` を受けて `Page<T>`（`items` と `next`）を返し、
  画面は `PagedList`（`utils/paged-list.svelte.ts`）で1ページ目に続きを足して、下端に `LoadMore` を置く。
  続きは `?offset=` を付けた同じ URL の `load` を `preloadData` で読む（専用の API は作らない）。
  戻ったときに読んだ分を残すため、`export const snapshot = list.snapshot` を置く
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

## 8. WebMCP で予想の下書きを受ける

WebMCP は試験的な機能として残す。Claude・ChatGPT から読む安定した経路はサーバーの MCP（`/mcp`）で、
画面は同意（`/oauth/authorize`）と連携の一覧（`/settings/connections`）だけ（→ [architecture.md 3-10](./architecture.md)）。

使い方はログインした人向けの `/help/webmcp` に置き、予想画面からリンクする。
対応判定は tool と同じ `getModelContext()` を使うが、案内ページでは tools を登録しない。
API の有無だけで AI 接続や登録成功まで確認できたように表示しない。
Chrome の試験設定・Inspector の案内は公式資料を参照し、確認日を画面に載せる。
ブラウザや AI の仕様が合わなければ使えないこと、通常入力は続けられることも説明する。

**読む場面:** 予想画面の AI 連携、下書きの部分更新、WebMCP の仕様を変えるとき。
保存 action の仕様は [api.md 第3章](./api.md)、DB の責務は [architecture.md 第0章](./architecture.md)。

`/races/[id]/preview` だけで `get_prediction_context` と `apply_prediction_draft` を登録する。
[WebMCP の 2026-09-30 draft](https://webmachinelearning.github.io/webmcp/) に従い、
`document.modelContext.registerTool(tool, { signal })` を使い、解除は登録に渡した `AbortController.abort()`。
対応判定と局所的な型は `src/lib/webmcp/support.ts`、tool と取得値の整形は `prediction.ts` に置く。
予想ページの `$effect` は mount 後に登録し、レース ID が変わる SPA 遷移と unmount で解除する。
解除済みのコールバックも `inactive_page` で拒否する。非対応・登録失敗では通常のフォームをそのまま使える。
旧 `navigator.modelContext` API の互換実装や polyfill は入れていない。

### 取得

`get_prediction_context` の入力は空オブジェクト。`load` の `race`・`rows`・`sameCondition`・`oddsAsOf` を使い、
レースの条件、各出走馬の ID / 馬 / 騎手、オッズと人気、本人の履歴、過去走を返す。
`oddsAsOf` は ISO 文字列から Unix epoch ミリ秒へ変換し、未取得は null。
`myCurrentPrediction` と追加の `myCurrentRacePrediction` は `DraftKeeper.snapshot()` から現在の入力も読む。
`load` の `user` やセッションは渡さない。`readOnlyHint: true` / `consequentialHint: false` / `untrustedContentHint: true` を設定し、
取得したメモや外部データを指示として扱わない旨も tool の説明に書く。

### 反映

`apply_prediction_draft` は `predictionDraftSchema`（Valibot）で受信値を検証する。
公開する JSON Schema もこのスキーマから `@valibot/to-json-schema` で生成し、選択肢・上限を二重管理しない。
未知のプロパティ、未知の印・札・ペース、10000文字を超える本文、盤面外の座標、不完全な flow は拒否する。
本文・札の並び・座標・局面メモの制約は既存の定義を使う。

```ts
type PredictionDraft = {
  race?: { body?: string; pace?: Pace | null; flow?: RaceFlow | null };
  entries: { entryId: string; body?: string; tags?: NoteTag[]; mark?: Mark | null }[];
};
```

`entries` は必須（レースだけなら `[]`）。**未指定は既存値を維持**し、`body: ''`、`mark: null`、`tags: []`、
`pace: null` はその欄を明示的にクリアする。`flow` を指定した場合は pace と3局面（spots / memo）を含む
展開全体を置き換える。`flow: null` は展開全体のクリアで、本文は維持する。
`race.pace` と `flow.pace` を両方指定した場合は `race.pace` を優先する。

`preparePredictionDraft` は `data.rows` の許可 ID で、entries と全局面の spots を**変換前に全部**確かめる。
未知の ID は `{ status: 'rejected', reason: 'unknown_entry', entryId }` を返して全体を拒否する。
同じ馬への二重入力は `duplicate_entry`、同じ局面での馬やマスの重複は `overlapping_flow`。
出馬表前は展開の欄が無いため、pace / flow の指定を `flow_unavailable` として拒否する（見立ての本文は使える）。
その他の入力の誤りは `invalid_input`、フォーム未準備は `form_unavailable`。

`predictionDraftToFields` は指定された欄だけを `FieldValues` に変換する純粋関数。
`DraftKeeper.apply(values)` が既存の復元処理を使って欄へ当て、泡立たない `input` / `change` を通知する。
本文の `bind:value`、展開の hidden input の直接監視、ペースのラジオが同期したあと、`tick()` を待って差分を読む。
未保存件数・端末内下書き・離脱警告は手入力と同じ経路。
成功は `{ status: 'applied', saved: false }` とトーストで知らせる。通知は画面上部に出し、下端の未保存件数・保存ボタンを覆わない。
`readOnlyHint: false` / `consequentialHint: false` を設定する。
**送信はせず、ユーザーが既存の一括保存ボタンを押したときだけ既存 action / `savePreviewNotes()` を呼ぶ。**
ボタンの文言は出走馬がいれば「出走前メモを保存」、出馬表前は「レースの見立てを保存」。
JSON Schema に表せない正規化と ID の所属検証は受信時に行い、最終保存時も既存 action が DB を正として検証する。
