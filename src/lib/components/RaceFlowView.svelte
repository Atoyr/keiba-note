<script lang="ts">
	import RaceFlowBoard from '$lib/components/RaceFlowBoard.svelte';
	import { FLOW_PHASES, FLOW_PHASE_LABEL } from '$lib/schemas/race-flow';
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import { flowColumns, type ResolvedFlow } from '$lib/utils/race-flow';

	/**
	 * 展開の予想を読むだけの形。予想まとめ・共有ページ・ふりかえりで使う。
	 *
	 * 3つの局面の盤面を並べる（広い画面は2つずつ、スマホは縦に積む）。3つ横に並べると
	 * マスが 20px ほどになり、枠順前の頭2文字のコマが読めない。書く画面と違って
	 * タブにしないのは、読む場では局面の移り変わりを見比べるのが用だから。
	 * 盤面の下に隊列の1行（`⑤-③⑦`）を添える。盤面だけだと読み上げで順が追いにくい。
	 *
	 * 局面は `li` にしない。予想まとめでは各馬の行が `li` なので、同じ入れ物だと
	 * 「馬の行」を拾う側（テストや支援技術のリスト移動）に局面まで混ざる。
	 */
	let {
		flow,
		phaseLevel = 'h3'
	}: {
		flow: ResolvedFlow;
		/** 局面名の見出しの段。囲みの見出し（「展開の予想」）より1つ下にする。 */
		phaseLevel?: 'h3' | 'h4';
	} = $props();

	const phases = $derived(
		FLOW_PHASES.filter((p) => flow[p].spots.length > 0 || flow[p].memo !== '')
	);
</script>

<div class="grid gap-3">
	{#if flow.pace}
		<p class="text-sm">
			<span class="text-xs text-muted-foreground">ペース</span>
			<span class="ml-1 rounded border px-1.5 text-xs font-medium">{flow.pace}</span>
		</p>
	{/if}
	{#if phases.length > 0}
		<div class="grid gap-4 sm:grid-cols-2">
			{#each phases as p (p)}
				<div class="min-w-0">
					<svelte:element this={phaseLevel} class="text-xs font-medium text-muted-foreground"
						>{FLOW_PHASE_LABEL[p]}</svelte:element
					>
					{#if flow[p].spots.length > 0}
						<div class="mt-1">
							<RaceFlowBoard
								spots={flow[p].spots.map((s, i) => ({ ...s, key: String(i) }))}
								leadsRight={flow.leadsRight}
								label="{FLOW_PHASE_LABEL[p]}の隊列"
							/>
						</div>
						<p class="mt-1 text-sm"><FlowOrder columns={flowColumns(flow[p].spots)} /></p>
					{/if}
					{#if flow[p].memo}
						<p class="mt-1 text-sm leading-relaxed">{flow[p].memo}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
