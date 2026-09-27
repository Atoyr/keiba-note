<script lang="ts">
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import { FLOW_PHASE_SHORT } from '$lib/schemas/race-flow';
	import { flowColumns, type ResolvedFlow } from '$lib/utils/race-flow';
	import type { actualFlow } from '$lib/utils/run-stats';

	/**
	 * ふりかえり画面の「実際の展開」。4コーナーとゴール前の隊列を1行ずつ出す。
	 *
	 * **予想で展開を置いていなくても出す。** どう流れたかは結果（通過順・着順）から読めるので、
	 * 予想の有無でこの欄が消えると、展開を考えなかったレースほどふりかえりの材料が減る。
	 * 予想を置いていたら、同じ局面の下に予想の隊列を並べて見比べられるようにする。
	 * 結果には内外が無いので盤面にはしない（前後の順だけ。予想の盤面は「開催前の見立て」で開ける）。
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
			return [{ phase: p, actual: got, predicted: spots.length > 0 ? flowColumns(spots) : null }];
		})
	);

	/** 予想を1局面でも置いていたら「実際」「予想」の札を付ける。無ければ札を付けない（1段しか無い）。 */
	const compare = $derived(phases.some((p) => p.predicted));
</script>

<section aria-labelledby="actual-flow-heading" class="rounded-lg border px-3 py-2.5">
	<h2 id="actual-flow-heading" class="text-sm font-semibold">実際の展開</h2>
	<p class="text-xs text-muted-foreground">
		4角は通過順、ゴール前は着順の並び（内外は分からないので前後だけ）
	</p>
	<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
		{#each phases as p (p.phase)}
			<dt class="pt-0.5 text-xs font-medium text-muted-foreground">
				{FLOW_PHASE_SHORT[p.phase]}
			</dt>
			<dd class="grid min-w-0 gap-0.5">
				<p class="text-sm">
					{#if compare}<span class="mr-1 text-xs text-muted-foreground">実際</span>{/if}<FlowOrder
						columns={p.actual}
					/>
				</p>
				{#if p.predicted}
					<p class="text-sm text-muted-foreground">
						<span class="mr-1 text-xs">予想</span><FlowOrder columns={p.predicted} />
					</p>
				{/if}
			</dd>
		{/each}
	</dl>
</section>
