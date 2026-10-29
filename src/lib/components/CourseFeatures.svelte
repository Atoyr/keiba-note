<script lang="ts">
	import { conditionLabel } from '$lib/utils/note';

	/**
	 * コースの特徴（スタート・道中・ゴール前・展開と傾向）。コース図の直前に置いて並べて読む。
	 * 文は `graded-race-profile.ts` の表にある、独自にまとめた目安。
	 */
	let {
		race,
		course
	}: {
		race: { course: string; surface: string | null; distance: number | null };
		course: { start: string; middle: string; finish: string; tendency: string };
	} = $props();

	const id = $props.id();
	const condition = $derived(conditionLabel(race));
	const items = $derived([
		{ label: 'スタート', text: course.start },
		{ label: '道中', text: course.middle },
		{ label: 'ゴール前', text: course.finish },
		{ label: '展開と傾向', text: course.tendency }
	]);
</script>

<section aria-labelledby="{id}-course">
	<h2 id="{id}-course" class="text-sm font-semibold text-muted-foreground">
		コースの特徴
		{#if condition}<span class="font-normal">（{condition}）</span>{/if}
	</h2>
	<dl class="mt-2 grid gap-2 text-sm">
		{#each items as item (item.label)}
			<div>
				<dt class="text-xs font-semibold text-muted-foreground">{item.label}</dt>
				<dd class="mt-0.5 leading-relaxed break-words">{item.text}</dd>
			</div>
		{/each}
	</dl>
	<p class="mt-2 text-xs text-muted-foreground">独自にまとめた目安です。</p>
</section>
