<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { resolve } from '$app/paths';
	import CourseMap from '$lib/components/CourseMap.svelte';
	import GradedRaceTrend from '$lib/components/GradedRaceTrend.svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { gradedRaceKey, gradedRaceParam, isGraded } from '$lib/utils/graded-race';
	import { conditionLabel, noteHeading } from '$lib/utils/note';
	import type { RaceHeadingSource } from '$lib/utils/race-heading';
	let {
		race,
		trend,
		sameCondition
	}: {
		race: RaceHeadingSource &
			ComponentProps<typeof CourseMap>['race'] & {
				name: string | null;
			};
		trend: { key: string; body: string } | null;
		sameCondition: {
			id: string;
			raceId: string;
			raceName: string | null;
			course: string | null;
			raceNumber: number | null;
			grade: string | null;
			occurredAt: string;
			body: string;
		}[];
	} = $props();
</script>

<!-- 重賞の傾向 → 過去成績・レースメモ → コースの順。基本情報（開催日・発走・条件・頭数）は見出しに載せている。 -->
<div class="grid gap-6">
	{#if trend}<GradedRaceTrend raceKey={trend.key} body={trend.body} />{/if}
	<section aria-label="過去成績・レースメモ">
		<h2 class="text-sm font-semibold">過去成績・レースメモ</h2>
		{#if isGraded(race.grade) && race.name}
			<a
				href={resolve('/graded-races/[name]', { name: gradedRaceParam(gradedRaceKey(race.name)) })}
				class="mt-2 inline-flex min-h-6 items-center text-sm underline"
				>重賞のタイムラインで過去年の結果・見立てを見る</a
			>
		{/if}
		<h3 class="mt-3 text-xs font-semibold text-muted-foreground">
			同じ条件（{conditionLabel(race)}）で書いたレースのメモ
		</h3>
		{#if sameCondition.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">同じ条件のレースメモはまだありません。</p>
		{:else}
			<ol class="mt-2 grid gap-3">
				{#each sameCondition as note (note.id)}
					<li class="border-l-2 pl-3">
						<p class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
							{note.occurredAt}<GradeBadge grade={note.grade} /><a
								href={resolve('/races/[id]', { id: note.raceId })}
								class="underline">{noteHeading({ kind: 'race', ...note }).label}</a
							>
						</p>
						<p class="mt-1 text-sm break-words whitespace-pre-wrap">{note.body}</p>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
	<CourseMap {race} />
</div>
