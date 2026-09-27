<script lang="ts">
	import { SURFACE_COLOR } from '$lib/utils/course';
	import { elevationChart, type ElevationProfile } from '$lib/utils/course-elevation';

	/**
	 * スタートからゴールまでの高低断面。ゴールの向きはスタンドから見た向き
	 * （右回りはゴールが左、左回りと直線コースは右）で、中継や展開の盤面と揃える。
	 *
	 * 面と線は SVG を枠いっぱいに伸ばして描き、目盛りの文字は HTML で割合の位置に置く。
	 * 線の太さは `vector-effect` で伸ばしても変わらない。
	 */
	let { profile }: { profile: ElevationProfile } = $props();

	const chart = $derived(elevationChart(profile));
	const color = $derived(SURFACE_COLOR[profile.surface]);
</script>

<div class="mt-3 max-w-md">
	<p class="text-xs font-semibold text-muted-foreground" aria-hidden="true">高低断面</p>
	<!-- 左は高さの目盛りの幅。右は、端に来る「スタート」「ゴール」の文字を真ん中に揃えてもはみ出さない幅。 -->
	<div role="img" aria-label={chart.summary} class="mt-1 pr-6 pl-9">
		<div class="relative mt-2 h-20" aria-hidden="true">
			<svg
				viewBox="0 0 1000 100"
				preserveAspectRatio="none"
				class="absolute inset-0 size-full overflow-visible"
			>
				{#if chart.straight}
					<rect
						x={chart.straight.x1 * 10}
						width={(chart.straight.x2 - chart.straight.x1) * 10}
						y="0"
						height="100"
						class="fill-muted"
					/>
				{/if}
				{#each chart.levels as level (level.label)}
					<line
						x1="0"
						x2="1000"
						y1={level.y}
						y2={level.y}
						class={level.zero ? 'stroke-muted-foreground' : 'stroke-border'}
						stroke-width="1"
						vector-effect="non-scaling-stroke"
					/>
				{/each}
				<path d={chart.area} fill={color} fill-opacity="0.35" />
				<path
					d={chart.line}
					fill="none"
					stroke={color}
					stroke-width="2"
					stroke-linejoin="round"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
			{#if chart.straight}
				<span
					class="absolute top-0 px-1 text-xs text-muted-foreground {chart.straight.x1 <= 0
						? 'left-0'
						: 'right-0'}">直線</span
				>
			{/if}
			{#each chart.levels as level (level.label)}
				<span
					class="absolute -left-9 w-8 -translate-y-1/2 text-right text-xs text-muted-foreground tabular-nums"
					style:top="{level.y}%">{level.label}</span
				>
			{/each}
		</div>
		<div class="relative h-5" aria-hidden="true">
			{#each chart.ticks as tick (tick.label)}
				<span
					class="absolute top-1 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
					style:left="{tick.x}%">{tick.label}</span
				>
			{/each}
		</div>
	</div>
</div>
