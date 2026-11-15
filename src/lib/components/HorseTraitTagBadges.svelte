<script lang="ts">
	import { HORSE_TRAIT_TAGS, type HorseTraitTag } from '#lib/schemas/horse.ts';

	/**
	 * 馬に付けた札の表示（`JockeyTagBadges` と同じ見た目）。並びは `HORSE_TRAIT_TAGS` の順に直す（一覧で騎手ごとに位置が動かないように）。
	 * 系統ごとの色の意味は無いので、塗らずに罫線だけで出す（`HorseTraitTagPicker` の選んだ札と同じ枠の色）。
	 */
	let { tags, class: className = '' }: { tags: HorseTraitTag[]; class?: string } = $props();

	const shown = $derived(HORSE_TRAIT_TAGS.filter((t) => tags.includes(t)));
</script>

{#if shown.length > 0}
	<span class="inline-flex flex-wrap items-center gap-1 {className}">
		{#each shown as t (t)}
			<span
				class="inline-flex items-center rounded-md border border-primary/40 bg-primary/5 px-1.5 py-0 text-[11px] leading-5 text-foreground"
			>
				{t}
			</span>
		{/each}
	</span>
{/if}
