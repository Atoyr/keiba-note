<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FlowOrder from '$lib/components/FlowOrder.svelte';
	import type { Pace } from '$lib/schemas/race-flow';
	import { firstLapLength, lapChart, lapDiffLabel, lapSummary } from '$lib/utils/laps';

	/**
	 * ふりかえり画面の「ラップ」。前半3F・後半3Fと、区間タイムの折れ線。
	 *
	 * 「レースのメモ」に書くペースを、感じたことではなく数字で確かめられるようにする。
	 * **既定は畳む**（実際の展開と同じ）。閉じた行に前半3F・後半3Fと差を出し、開くと折れ線と区間タイムの1行が出る。
	 * 予想でペースを選んでいたら、閉じた行に並べる（答え合わせ）。
	 *
	 * 折れ線は速い区間ほど上（ペースが上がったところが山に見える）。縦の目盛りは 0 秒から取らない（→ `lapChart`）。
	 * 前半3F・後半3Fに数えた区間は薄く塗る。数値そのものは折れ線の下の1行（表の代わり）で読む。
	 */
	let {
		laps,
		distance,
		predictedPace = null
	}: {
		laps: number[];
		distance: number | null;
		/** 開催前に展開の予想で選んだペース。選んでいなければ null。 */
		predictedPace?: Pace | null;
	} = $props();

	const summary = $derived(lapSummary(laps, distance));
	const chart = $derived(lapChart(laps, distance));
	/** 区間タイムの1行。前半・後半3Fに数えた区間は、盤面の隊列の1行と同じ区切り（`-`）で並べる。 */
	const columns = $derived(laps.map((l) => l.toFixed(1)));
	/**
	 * 最初の区間が端数（2500m の 100m）なら、その長さ。折れ線は端数の区間を描かない（`lapChart`）ので、
	 * 左端は「スタート」ではなくこの地点になる。端数が無ければ null。
	 */
	const partial = $derived.by(() => {
		const len = firstLapLength(laps.length, distance);
		return len < 200 ? len : null;
	});
</script>

<section aria-labelledby="race-laps-heading" class="rounded-lg border px-3 py-2.5">
	<details class="group">
		<summary
			class="flex min-h-6 cursor-pointer list-none flex-wrap items-center gap-x-2 [&::-webkit-details-marker]:hidden"
		>
			<h2 id="race-laps-heading" class="text-sm font-semibold">ラップ</h2>
			<!-- 開閉の印は見出しの行の右端に置く（実際の展開と同じ）。数字を見出しの横に並べると、
			     スマホで印だけが次の行に落ちる。 -->
			<ChevronDown
				class="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
				aria-hidden="true"
			/>
			{#if summary}
				<span class="basis-full pt-0.5 text-xs text-muted-foreground tabular-nums">
					前半3F <span class="text-sm text-foreground">{summary.front.toFixed(1)}</span>
					· 後半3F <span class="text-sm text-foreground">{summary.back.toFixed(1)}</span>
					（{lapDiffLabel(summary.diff)}）
				</span>
			{/if}
			{#if predictedPace}
				<span class="basis-full text-xs text-muted-foreground">
					予想のペース <span class="rounded border px-1 font-medium">{predictedPace}</span>
				</span>
			{/if}
		</summary>

		<div class="mt-2 max-w-md">
			<!-- 左は目盛りの幅。面と線は SVG を伸ばして描き、文字は HTML で置く（CourseElevation と同じ）。 -->
			<div role="img" aria-label={chart.summary} class="pl-9">
				<!-- 前半3F・後半3Fの文字は折れ線の上に1行取って置く。面の中に置くと、目盛りの線や
				     最速の区間の点（上端に来る）と重なる。 -->
				<div class="relative h-4 text-xs text-muted-foreground" aria-hidden="true">
					{#if chart.front}
						<span class="absolute bottom-0" style:left="{chart.front.x1}%">前半3F</span>
					{/if}
					{#if chart.back}
						<span class="absolute bottom-0" style:right="{100 - chart.back.x2}%">後半3F</span>
					{/if}
				</div>
				<div class="relative h-20" aria-hidden="true">
					<svg
						viewBox="0 0 1000 100"
						preserveAspectRatio="none"
						class="absolute inset-0 size-full overflow-visible"
					>
						{#each [chart.front, chart.back] as band, i (i)}
							{#if band}
								<rect
									x={band.x1 * 10}
									width={(band.x2 - band.x1) * 10}
									y="0"
									height="100"
									class="fill-muted"
								/>
							{/if}
						{/each}
						{#each chart.levels as level (level.label)}
							<line
								x1="0"
								x2="1000"
								y1={level.y}
								y2={level.y}
								class="stroke-border"
								stroke-width="1"
								vector-effect="non-scaling-stroke"
							/>
						{/each}
						<path
							d={chart.line}
							fill="none"
							class="stroke-primary"
							stroke-width="2"
							stroke-linejoin="round"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
					{#each chart.levels as level (level.label)}
						<span
							class="absolute -left-9 w-8 -translate-y-1/2 text-right text-xs text-muted-foreground tabular-nums"
							style:top="{level.y}%">{level.label}</span
						>
					{/each}
				</div>
				<div class="flex justify-between pt-1 text-xs text-muted-foreground" aria-hidden="true">
					<span>{partial ? `${partial}m` : 'スタート'}</span><span>ゴール</span>
				</div>
			</div>
			<p class="mt-1 text-sm tabular-nums"><FlowOrder {columns} /></p>
			<p class="text-xs text-muted-foreground">
				速い区間ほど上。塗った所が前半3F・後半3F{#if partial}。最初の{partial}mは折れ線に入れない{/if}
			</p>
		</div>
	</details>
</section>
