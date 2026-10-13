<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	/**
	 * 出走馬の行の、開いて入力する部分。
	 *
	 * `memo` は閉じた行に出すメモ（本文と札。`EntryMemo`）。`<details>` の前に置き、**行を開いている間は隠す**
	 * （開いた中の入力欄と同じものが2つ並ぶため）。隠すのは CSS（すぐ後ろの兄弟の `details` が開いているとき）なので、
	 * JS が無くても効く。親の `li` の直下に `details` を並べる形（`li > details > summary`）は変えない。
	 *
	 * `status` が空なら、summary の左の文言を出さない（メモや印が見えていて、言うことが無いとき）。
	 */
	let {
		horseName,
		status,
		openLabel = '開いて入力する',
		memo,
		children
	}: {
		horseName: string;
		status: string;
		openLabel?: string;
		memo?: Snippet;
		children: Snippet;
	} = $props();
</script>

{#if memo}
	<!-- すぐ後ろの兄弟の details が開いているときだけ隠す（`:has(~ details[open])`。中の「詳細情報」の details は兄弟ではないので拾わない）。 -->
	<div class="mt-2 grid gap-1.5 has-[~details[open]]:hidden">
		{@render memo()}
	</div>
{/if}
<!-- ネイティブ details は JS 無効でも開閉でき、閉じた入力も送信する。リンクは summary の外。
     summary の名前は aria-label で上書きせず、見えている文字に馬名を足して作る
     （見える状態・「＋ 出走前メモ」・「閉じる」がそのまま名前に入る。WCAG 2.5.3）。 -->
<details class="group/entry mt-2">
	<summary
		class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
	>
		<span class="sr-only">{horseName}</span>
		{#if status}<span>{status}</span>{/if}
		<span class="ml-auto flex shrink-0 items-center gap-1">
			<span class="group-open/entry:hidden">{openLabel}</span>
			<span class="hidden group-open/entry:inline">閉じる</span>
			<ChevronDown class="size-4 group-open/entry:rotate-180" />
		</span>
	</summary>
	<div class="mt-3 grid grid-cols-1 gap-3 border-t pt-3">
		{@render children()}
	</div>
</details>
