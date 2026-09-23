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
	 *
	 * `<details>` は自分では閉じないので、メニューらしく外側を押す・Esc で閉じるのは
	 * ここで足す。以前は中の操作を押すまで閉じる手段が無く、開いたまま残っていた。
	 *
	 * 開閉は `bind:open` にせず、要素の `open` を直に読み書きする。`bind:open` だと
	 * hydration が状態（閉）を要素に書き戻し、JS が届く前に開いたメニューが勝手に閉じる。
	 */
	let { children, label = 'メモの操作' }: { children: Snippet; label?: string } = $props();

	let details: HTMLDetailsElement;
	let summary: HTMLElement;

	function closeOnOutside(e: MouseEvent) {
		if (details.open && !details.contains(e.target as Node)) details.open = false;
	}

	function closeOnEscape(e: KeyboardEvent) {
		if (!details.open || e.key !== 'Escape') return;
		// 中にフォーカスがあったときだけ `⋯` に戻す。よそで押した Esc でフォーカスを奪わない。
		const focusInside = details.contains(document.activeElement);
		details.open = false;
		if (focusInside) summary.focus();
	}
</script>

<svelte:window onclick={closeOnOutside} onkeydown={closeOnEscape} />

<details class="group relative" bind:this={details}>
	<summary
		bind:this={summary}
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
