<script lang="ts">
	import type { Snippet } from 'svelte';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	/**
	 * メモ1件ぶんの「その他の操作」。共有・削除のような、**書いて読み返すあいだには
	 * 使わない操作**をここに畳む。
	 *
	 * このアプリの用は「次のレースで勝つためにメモを積み上げること」で、共有は脇役。
	 * 以前は一覧の全メモに「共有リンクを作る」ボタンが出しっぱなしで、
	 * 画面で一番目立つのがそれになっていた。
	 *
	 * `<details>` にしたのは JS 無効でも開けるため（予想画面の書き直しと同じ）。
	 * 共有中であることは見出しの `SharedBadge` が出すので、畳んでも見落とさない。
	 */
	let { children, label = 'メモの操作' }: { children: Snippet; label?: string } = $props();
</script>

<details class="group relative">
	<summary
		class="flex size-6 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground group-open:bg-accent hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden"
		aria-label={label}
		title={label}
	>
		<Ellipsis class="size-4" />
	</summary>
	<div
		class="absolute right-0 z-10 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-background p-2 shadow-md"
	>
		{@render children()}
	</div>
</details>
