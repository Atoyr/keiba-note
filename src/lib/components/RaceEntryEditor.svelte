<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	let {
		horseName,
		status,
		openLabel = '開いて入力する',
		children
	}: { horseName: string; status: string; openLabel?: string; children: Snippet } = $props();
</script>

<!-- ネイティブ details は JS 無効でも開閉でき、閉じた入力も送信する。リンクは summary の外。
     summary の名前は aria-label で上書きせず、見えている文字に馬名を足して作る
     （見える状態・「＋ 出走前メモ」・「閉じる」がそのまま名前に入る。WCAG 2.5.3）。 -->
<details class="group/entry mt-2">
	<summary
		class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
	>
		<span class="sr-only">{horseName}</span>
		<span>{status}</span>
		<span class="flex shrink-0 items-center gap-1">
			<span class="group-open/entry:hidden">{openLabel}</span>
			<span class="hidden group-open/entry:inline">閉じる</span>
			<ChevronDown class="size-4 group-open/entry:rotate-180" />
		</span>
	</summary>
	<div class="mt-3 grid grid-cols-1 gap-4 rounded-md border-t bg-background p-3">
		{@render children()}
	</div>
</details>
