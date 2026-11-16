<script lang="ts">
	import { HORSE_TRAIT_TAGS, type HorseTraitTag } from '#lib/schemas/horse.ts';

	/**
	 * 馬に付けた札の表示（`JockeyTagBadges` と同じ見た目）。並びは `HORSE_TRAIT_TAGS` の順に直す（一覧で騎手ごとに位置が動かないように）。
	 * 系統ごとの色の意味は無いので、塗らずに罫線だけで出す（`HorseTraitTagPicker` の選んだ札と同じ枠の色）。
	 *
	 * `short` では末尾の「巧者」を落として短く出す（「京都」「右回り」「中距離」）。予想・ふりかえりの馬名の下の行で、
	 * このレースに合う札を狭い名前の列に収めるため（✓ のアイコンと読み上げの「このレースに合う札」で、得意のことだと分かる）。
	 * 元の札の名前は `title` に残す。
	 */
	let {
		tags,
		short = false,
		class: className = ''
	}: { tags: HorseTraitTag[]; short?: boolean; class?: string } = $props();

	const shown = $derived(HORSE_TRAIT_TAGS.filter((t) => tags.includes(t)));
</script>

{#if shown.length > 0}
	<span class="inline-flex flex-wrap items-center gap-1 {className}">
		{#each shown as t (t)}
			<span
				class="inline-flex items-center rounded-md border border-primary/40 bg-primary/5 px-1.5 py-0 text-[11px] leading-5 text-foreground"
				title={short ? t : undefined}
			>
				{short ? t.replace(/巧者$/, '') : t}
			</span>
		{/each}
	</span>
{/if}
