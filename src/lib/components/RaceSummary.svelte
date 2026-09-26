<script lang="ts">
	import type { Snippet } from 'svelte';
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import BracketBadge from '$lib/components/BracketBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import RaceFlowDetails from '$lib/components/RaceFlowDetails.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import { hasResolvedFlow } from '$lib/utils/race-flow';
	import { orderedSummaryRows, type RaceSummary } from '$lib/utils/race-summary';
	let {
		summary,
		authorName,
		actions
	}: { summary: RaceSummary; authorName: string; actions?: Snippet } = $props();
	const rows = $derived(orderedSummaryRows(summary.rows));
</script>

<article class="min-w-0 space-y-6 break-words">
	<div>
		<div class="mb-2 flex items-center justify-between gap-4">
			<p class="text-sm font-medium text-muted-foreground">予想まとめ</p>
			{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
		</div>
		<RaceHeading {...summary.race} />
		<p class="mt-3 text-sm text-muted-foreground">{authorName} の予想</p>
	</div>
	{#if summary.body}
		<section aria-labelledby="summary-outlook" class="rounded-lg border p-4">
			<h2 id="summary-outlook" class="text-sm font-semibold">レースの見立て</h2>
			<p class="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{summary.body}</p>
		</section>
	{/if}
	<!-- 共有のコピーは展開を入れる前に作ったものもあるので、無ければ欄ごと出さない。 -->
	{#if hasResolvedFlow(summary.flow)}
		<section aria-labelledby="summary-flow" class="rounded-lg border p-4">
			<RaceFlowDetails flow={summary.flow} titleId="summary-flow" />
		</section>
	{/if}
	{#if summary.rows.length}
		<section aria-labelledby="summary-horses">
			<h2 id="summary-horses" class="mb-3 text-sm font-semibold">各馬のメモ・印</h2>
			<ul class="divide-y rounded-lg border">
				{#each rows as row, i (i)}
					<li class="space-y-2 p-4">
						<div class="flex flex-wrap items-center gap-2">
							<BracketBadge bracket={row.bracket} />
							<span class="text-sm text-muted-foreground">{row.horseNumber ?? '—'}番</span>
							<span class="font-semibold">{row.horseName}</span>
							<MarkBadge mark={row.mark} />
						</div>
						{#if row.body}<p class="text-sm leading-relaxed whitespace-pre-wrap">{row.body}</p>{/if}
						{#if row.tags.length}<TagBadges tags={row.tags} />{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</article>
