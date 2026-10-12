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
				startTime: string | null;
				fieldSize: number | null;
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
	const facts = $derived([
		['開催日', race.date],
		['開催', `${race.course}${race.raceNumber === null ? '' : `${race.raceNumber}R`}`],
		['発走', race.startTime],
		['格・クラス', race.grade ?? race.className],
		[
			'馬場・距離',
			[race.surface, race.distance === null ? null : `${race.distance}m`].filter(Boolean).join(' ')
		],
		['回り', race.direction],
		['馬場状態', race.trackCondition],
		['天候', race.weather],
		['頭数', race.fieldSize === null ? null : `${race.fieldSize}頭`]
	]);
</script>

<div class="grid gap-6">
	<CourseMap {race} />
	<section aria-label="基本情報">
		<h2 class="text-sm font-semibold">基本情報</h2>
		<dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
			{#each facts as [label, value] (label)}
				<div>
					<dt class="text-xs text-muted-foreground">{label}</dt>
					<dd>{value || '—'}</dd>
				</div>
			{/each}
		</dl>
	</section>
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
</div>
