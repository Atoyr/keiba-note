<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import RaceFlowView from '$lib/components/RaceFlowView.svelte';
	import { flowDigest, type ResolvedFlow } from '$lib/utils/race-flow';
	import { cn } from '$lib/utils';

	/**
	 * 読むだけの展開の予想を畳んだ形。予想まとめ・共有ページ・ふりかえりで同じ見せ方にする。
	 *
	 * **どの画面でも既定は畳む。** 3局面の盤面はスマホで縦に積むと 700px を超え、
	 * 予想まとめでは各馬の印を最初の1画面から押し出してしまう。
	 * 閉じた行にはペースと局面ごとの隊列の1行（予想画面の閉じた行と同じ）を出し、開かなくても中身が分かるようにする。
	 */
	let {
		flow,
		titleId,
		titleClass = '',
		level = 'h2'
	}: {
		flow: ResolvedFlow;
		/** 見出しの段。置く画面の見出しの並びに合わせる。 */
		level?: 'h2' | 'h3';
		/** 見出しの id。囲みの section が aria-labelledby で指す。 */
		titleId?: string;
		/** 見出しの文字の見た目。置く画面の見出しに合わせる。 */
		titleClass?: string;
	} = $props();

	const digest = $derived(flowDigest(flow));
</script>

<details class="group">
	<summary
		class="flex min-h-6 cursor-pointer list-none flex-wrap items-center gap-x-2 [&::-webkit-details-marker]:hidden"
	>
		<svelte:element this={level} id={titleId} class={cn('text-sm font-semibold', titleClass)}
			>展開の予想</svelte:element
		>
		{#if flow.pace}
			<span class="rounded border px-1 text-xs font-medium group-open:hidden">{flow.pace}</span>
		{/if}
		<ChevronDown
			class="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
			aria-hidden="true"
		/>
		{#if digest.length > 0}
			<span class="grid basis-full gap-0.5 pt-0.5 text-xs text-muted-foreground group-open:hidden">
				{#each digest as d (d.phase)}
					<span>{d.label} <FlowOrder columns={d.columns} class="text-sm text-foreground" /></span>
				{/each}
			</span>
		{/if}
	</summary>
	<div class="mt-2">
		<RaceFlowView {flow} phaseLevel={level === 'h2' ? 'h3' : 'h4'} />
	</div>
</details>
