<script lang="ts">
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import RaceFlowBoard from '$lib/components/RaceFlowBoard.svelte';
	import { FLOW_PHASE_LABEL } from '$lib/schemas/race-flow';
	import { flowColumns, type ResolvedFlow } from '$lib/utils/race-flow';
	import type { actualFlow } from '$lib/utils/run-stats';

	/**
	 * ふりかえり画面の「実際の展開」。4コーナーとゴール前の隊列を、予想と同じ盤面で出す。
	 *
	 * **予想で展開を置いていなくても出す。** どう流れたかは結果（通過順・着順）から読めるので、
	 * 予想の有無でこの欄が消えると、展開を考えなかったレースほどふりかえりの材料が減る。
	 *
	 * 結果には内外が無いので、盤面の上下は同じマスの馬を積んだだけ（置き方は `actualFlow`）。
	 * それを盤面の下に書き添える。
	 * 予想を置いていたら、盤面の下の隊列の1行に予想の隊列を並べて見比べる。
	 * 予想の盤面まで並べると、スマホで盤面が4枚縦に積まれて書く欄が遠くなるので、
	 * 予想の盤面は「開催前の見立て」を開いて見る。
	 */
	let {
		actual,
		predicted = null
	}: {
		actual: NonNullable<ReturnType<typeof actualFlow>>;
		/** 開催前に置いた展開の予想。置いていなければ null。 */
		predicted?: ResolvedFlow | null;
	} = $props();

	const phases = $derived(
		(['corner4', 'finish'] as const).flatMap((p) => {
			const got = actual[p];
			if (!got) return [];
			const spots = predicted?.[p].spots ?? [];
			return [{ phase: p, ...got, predicted: spots.length > 0 ? flowColumns(spots) : null }];
		})
	);

	/** 予想を1局面でも置いていたら「実際」「予想」の札を付ける。無ければ札を付けない（1段しか無い）。 */
	const compare = $derived(phases.some((p) => p.predicted));
</script>

<section aria-labelledby="actual-flow-heading" class="rounded-lg border px-3 py-2.5">
	<h2 id="actual-flow-heading" class="text-sm font-semibold">実際の展開</h2>
	<p class="text-xs text-muted-foreground">4角は通過順、ゴール前は着順から</p>
	<!-- 局面は li にしない（RaceFlowView と同じ。馬の行の li と混ざらないように）。 -->
	<div class="mt-2 grid gap-4 sm:grid-cols-2">
		{#each phases as p (p.phase)}
			<div class="min-w-0">
				<h3 class="text-xs font-medium text-muted-foreground">{FLOW_PHASE_LABEL[p.phase]}</h3>
				<div class="mt-1">
					<RaceFlowBoard
						spots={p.spots.map((s, i) => ({ ...s, key: String(i) }))}
						leadsRight={actual.leadsRight}
						label="実際の{FLOW_PHASE_LABEL[p.phase]}の隊列"
					/>
				</div>
				<p class="mt-1 text-sm">
					{#if compare}<span class="mr-1 text-xs text-muted-foreground">実際</span>{/if}<FlowOrder
						columns={p.columns}
					/>
				</p>
				{#if p.predicted}
					<p class="text-sm text-muted-foreground">
						<span class="mr-1 text-xs">予想</span><FlowOrder columns={p.predicted} />
					</p>
				{/if}
			</div>
		{/each}
	</div>
	<p class="mt-2 text-xs text-muted-foreground">
		結果に内外は無いので、盤面の上下は同じ位置の馬を積んだだけ
	</p>
</section>
