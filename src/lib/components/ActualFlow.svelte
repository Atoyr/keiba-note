<script lang="ts">
	import FlowDigest from '$lib/components/FlowDigest.svelte';
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import RaceFlowBoard from '$lib/components/RaceFlowBoard.svelte';
	import { FLOW_PHASE_LABEL, FLOW_PHASE_SHORT } from '$lib/schemas/race-flow';
	import { flowColumns, type ResolvedFlow } from '$lib/utils/race-flow';
	import type { actualFlow } from '$lib/utils/run-stats';

	/**
	 * ふりかえり画面の「実際の展開」。4コーナーとゴール前の隊列を、予想と同じ盤面で出す。
	 *
	 * **予想で展開を置いていなくても出す。** どう流れたかは結果（通過順・着順）から読めるので、
	 * 予想の有無でこの欄が消えると、展開を考えなかったレースほどふりかえりの材料が減る。
	 *
	 * **既定は畳む**（予想の「展開の予想」と同じ形。依頼による）。盤面は2枚でスマホの 1画面の半分ほどを取り、
	 * 開いたままだと書く欄が遠くなる。閉じた行には局面ごとの隊列の1行を出し、開かなくても流れが分かるようにする。
	 *
	 * 結果には内外が無いので、盤面の上下は同じマスの馬を積んだだけ（置き方は `actualFlow`）。
	 * そのため盤面は「内外を持たない並び」として描く（`RaceFlowBoard` の `note`）: 見出しに「内ラチ」を出さず注記を出し、
	 * 読み上げは段の名前ではなく順位（「4角2番手」「3着」）にする。段は予想の盤面と同じ4段のまま。
	 * 前後は、4角は通過順の同じ数字を1列に、ゴール前は着差（馬身）で置く。着順を2頭ずつ並べると、
	 * ハナ差の2頭と2馬身離れた2頭が同じ見た目になるため。着差で置いたときは、1マスの馬身を注記に出す。
	 * 予想を置いていたら、盤面の下の隊列の1行に予想の隊列を並べて見比べる。
	 * 予想の盤面まで並べると盤面が4枚になるので、予想の盤面は「開催前の見立て」を開いて見る。
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
			const said = (s: (typeof got.spots)[number]) =>
				`${s.horseNumber ? `${s.horseNumber}番 ` : ''}${s.horseName}（${p === 'finish' ? `${s.at}着` : `4角${s.at}番手`}）`;
			return [
				{
					phase: p,
					columns: got.columns,
					cell: got.cell,
					spots: got.spots.map((s, i) => ({ ...s, key: String(i), said: said(s) })),
					predicted: spots.length > 0 ? flowColumns(spots) : null
				}
			];
		})
	);

	/** ゴール前を着差で置いたか（置いていれば、盤面の注記に1マスの馬身を出す）。 */
	const byMargin = $derived(actual.finish?.cell != null);

	/** 閉じた行に出す、局面ごとの実際の隊列（予想の閉じた行と同じ形）。 */
	const digest = $derived(
		phases.map((p) => ({ phase: p.phase, label: FLOW_PHASE_SHORT[p.phase], columns: p.columns }))
	);

	/** 予想を1局面でも置いていたら「実際」「予想」の札を付ける。無ければ札を付けない（1段しか無い）。 */
	const compare = $derived(phases.some((p) => p.predicted));
</script>

<section aria-labelledby="actual-flow-heading" class="rounded-lg border px-3 py-2.5">
	<details class="group">
		<summary
			class="flex min-h-6 cursor-pointer list-none flex-wrap items-center gap-x-2 [&::-webkit-details-marker]:hidden"
		>
			<h2 id="actual-flow-heading" class="text-sm font-semibold">実際の展開</h2>
			<FlowDigest pace={null} {digest} />
		</summary>
		<p class="mt-1 text-xs text-muted-foreground">
			4角は通過順、ゴール前は{byMargin ? '着差' : '着順'}から
		</p>
		<!-- 局面は li にしない（RaceFlowView と同じ。馬の行の li と混ざらないように）。 -->
		<div class="mt-2 grid gap-4 sm:grid-cols-2">
			{#each phases as p (p.phase)}
				<div class="min-w-0">
					<h3 class="text-xs font-medium text-muted-foreground">{FLOW_PHASE_LABEL[p.phase]}</h3>
					<div class="mt-1">
						<RaceFlowBoard
							spots={p.spots}
							leadsRight={actual.leadsRight}
							note={p.cell === null
								? '上下は内外ではない'
								: `上下は内外ではない・1マス約${p.cell.toFixed(1)}馬身`}
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
	</details>
</section>
