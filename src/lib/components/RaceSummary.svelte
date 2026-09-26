<script lang="ts">
	import RaceHeading from '$lib/components/RaceHeading.svelte';
	import BracketBadge from '$lib/components/BracketBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import type { RaceSummary } from '$lib/utils/race-summary';
	let { summary, authorName }: { summary: RaceSummary; authorName: string } = $props();
</script>

<article class="min-w-0 space-y-6 break-words">
	<div>
		<p class="mb-2 text-sm font-medium text-muted-foreground">予想まとめ</p>
		<RaceHeading {...summary.race} />
		<p class="mt-3 text-sm text-muted-foreground">{authorName} の予想</p>
	</div>
	{#if summary.body}
		<section aria-labelledby="summary-outlook" class="rounded-lg border p-4">
			<h2 id="summary-outlook" class="text-sm font-semibold">レースの見立て</h2>
			<p class="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{summary.body}</p>
		</section>
	{/if}
	{#if summary.rows.length}
		<section aria-labelledby="summary-horses">
			<h2 id="summary-horses" class="mb-3 text-sm font-semibold">各馬のメモ・印</h2>
			<ul class="divide-y rounded-lg border">
				{#each summary.rows as row, i (i)}
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
