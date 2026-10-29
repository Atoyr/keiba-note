<script lang="ts">
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { isUpcoming, opensReview } from '$lib/utils/date';

	/**
	 * 重賞の競走条件・優先出走権・主要なステップレースとその勝ち馬（レース情報タブ）。
	 * 表（`graded-race-profile.ts`）に紹介がある重賞だけ、親が出す。
	 * 型は構造的に書く（画面側はサーバーのコードを型ですら import しない。architecture.md 第2章）。
	 */
	let {
		profile,
		today
	}: {
		profile: {
			conditions: string;
			priority: { race: string; places: number }[];
			priorityNote: string | null;
			since: number;
			steps: {
				key: string;
				/** そのステップが優先出走権を与えるなら、何着までか。 */
				priority: number | null;
				race: {
					id: string;
					date: string;
					course: string;
					raceNumber: number | null;
					name: string | null;
					grade: string | null;
					winnerName: string | null;
					resultCount: number;
				} | null;
			}[];
		};
		/** 今日（`YYYY-MM-DD`）。行の行き先とレース前かを決める。 */
		today: string;
	} = $props();

	const id = $props.id();

	/** 優先出走権の文を、折り返しで「1」と「着馬」が離れないよう、切らない部分に分ける。 */
	const priorityParts = $derived.by(() => {
		const { priority, priorityNote } = profile;
		if (priority.length === 0) return { kind: 'text' as const, text: priorityNote ?? 'なし' };
		if (priority.every((p) => p.places === 1)) {
			return {
				kind: 'all-first' as const,
				races: priority.map((p) => p.race).join('・')
			};
		}
		return {
			kind: 'mixed' as const,
			items: priority.map((p) => ({
				race: p.race,
				places: p.places === 1 ? '（1着）' : `（${p.places}着まで）`
			}))
		};
	});

	const placesLabel = (places: number) =>
		places === 1 ? '優先出走権 1着' : `優先出走権 ${places}着まで`;
</script>

<section aria-labelledby="{id}-conditions">
	<h2 id="{id}-conditions" class="text-sm font-semibold text-muted-foreground">
		レースの条件と前哨戦
	</h2>
	<dl class="mt-2 grid gap-1 text-sm">
		<div class="flex gap-3">
			<dt class="w-20 shrink-0 text-muted-foreground">条件</dt>
			<dd class="min-w-0 break-words">{profile.conditions}</dd>
		</div>
		<div class="flex gap-3">
			<dt class="w-20 shrink-0 text-muted-foreground">優先出走権</dt>
			<dd class="min-w-0 break-words">
				{#if priorityParts.kind === 'text'}{priorityParts.text}{:else if priorityParts.kind === 'all-first'}{priorityParts.races}<span
						class="whitespace-nowrap">の1着馬</span
					>{:else}{#each priorityParts.items as item, i (item.race)}{#if i > 0}・{/if}{item.race}<span
							class="whitespace-nowrap">{item.places}</span
						>{/each}{/if}
			</dd>
		</div>
	</dl>
	<h3 class="mt-3 text-sm font-semibold">主要なステップレース</h3>
	<ul class="mt-2 space-y-2">
		{#each profile.steps as step (step.key)}
			{@const r = step.race}
			<li>
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
					{#if r}
						<a
							href={opensReview({ date: r.date, resultCount: r.resultCount }, today)
								? resolve('/races/[id]', { id: r.id })
								: resolve('/races/[id]/preview', { id: r.id })}
							class="inline-flex min-h-6 items-center hover:underline">{step.key}</a
						>
					{:else}
						<span class="text-muted-foreground">{step.key}</span>
					{/if}
					{#if step.priority !== null}
						<Badge variant="outline" class="px-1.5 py-0 text-[11px]"
							>{placesLabel(step.priority)}</Badge
						>
					{/if}
				</div>
				<div
					class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
				>
					{#if r}
						<span class="font-mono">{r.date}</span>
						<GradeBadge grade={r.grade} />
						<span>{r.course}{r.raceNumber ?? ''}R</span>
						<span>
							{#if r.winnerName}勝ち馬 {r.winnerName}{:else if isUpcoming(r.date, today)}開催前{:else}結果待ち{/if}
						</span>
					{:else}
						<span>未登録</span>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	<p class="mt-2 text-xs text-muted-foreground">{profile.since}年の JRA の発表による。</p>
</section>
