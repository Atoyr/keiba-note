<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import type { Pace } from '$lib/schemas/race-flow';
	import type { flowDigest } from '$lib/utils/race-flow';

	/**
	 * 展開の予想の `<summary>` の中身のうち、見出しのあとに続くもの。入力欄（`RaceFlowEditor`）と
	 * 読むだけの形（`RaceFlowDetails`）で同じ閉じた行にする。
	 *
	 * ペースの札・開閉の印に続けて、局面ごとの隊列を見出しの下に全幅で出す。18頭だと1行に収まらないので、
	 * 見出しの横に並べず、局面ごとに1行ずつ折り返せるようにする。
	 * 開けば下の盤面が正なので、同じものを二重に見せない（`group-open:hidden` で高さごと外す）。
	 * 置く `<summary>` には `flex flex-wrap` と、`<details>` に `group` が要る。
	 */
	let {
		pace,
		digest,
		emptyLabel
	}: {
		pace: Pace | null;
		digest: ReturnType<typeof flowDigest>;
		/** ペースも隊列も無いときに出す文（入力欄の「＋ 書く」）。 */
		emptyLabel?: string;
	} = $props();
</script>

{#if pace}
	<span class="rounded border px-1 text-xs font-medium group-open:hidden">{pace}</span>
{:else if emptyLabel && digest.length === 0}
	<span class="text-xs text-muted-foreground group-open:hidden">{emptyLabel}</span>
{/if}
<ChevronDown
	class="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
	aria-hidden="true"
/>
{#if digest.length > 0}
	<span class="grid basis-full gap-0.5 pt-0.5 text-xs text-muted-foreground group-open:hidden">
		{#each digest as d (d.phase)}
			<span>{d.label} <FlowOrder columns={d.columns} class="text-sm text-foreground" /></span>
		{/each}
	</span>
{/if}
