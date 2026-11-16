<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { resolve } from '$app/paths';
	import CourseFeatures from '#lib/components/CourseFeatures.svelte';
	import CourseMap from '#lib/components/CourseMap.svelte';
	import GradedRaceTimeline from '#lib/components/GradedRaceTimeline.svelte';
	import GradedRaceTrend from '#lib/components/GradedRaceTrend.svelte';
	import GradeBadge from '#lib/components/GradeBadge.svelte';
	import RaceConditions from '#lib/components/RaceConditions.svelte';
	import { gradedRaceParam } from '#lib/utils/graded-race.ts';
	import { conditionLabel, noteHeading } from '#lib/utils/note.ts';
	import type { RaceHeadingSource } from '#lib/utils/race-heading.ts';
	let {
		race,
		graded,
		today,
		sameCondition
	}: {
		race: RaceHeadingSource &
			ComponentProps<typeof CourseMap>['race'] & {
				name: string | null;
			};
		/** G1〜G3 で名前のあるレースだけ。傾向が無ければ `trend` は null。`timeline` はこのレース自身の行を含まない。 */
		graded: {
			key: string;
			/** 過去の好走馬の要約（重賞の画面と同じ窓）。数だけで、率は持たない。 */
			placers: {
				fromYear: number;
				toYear: number;
				races: number;
				missing: number;
				winners: number;
				placers: number;
				popularity: { value: string; wins: number; placed: number }[];
			};
			trend: string | null;
			timeline: ComponentProps<typeof GradedRaceTimeline>['timeline'];
			/** 表に紹介がある重賞だけ。無ければ条件・コースの特徴の節は出さない。 */
			profile:
				| (ComponentProps<typeof RaceConditions>['profile'] & {
						course: ComponentProps<typeof CourseFeatures>['course'];
				  })
				| null;
		} | null;
		/** 今日（`YYYY-MM-DD`）。重賞のタイムラインの行の行き先を決める。 */
		today: string;
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

	const id = $props.id();
	const condition = $derived(conditionLabel(race));

	/** 「1番人気 3・4番人気 1」。数が0の段は出さず、全部0なら「不明」。 */
	function popularityText(
		rows: { value: string; wins: number; placed: number }[],
		key: 'wins' | 'placed'
	): string {
		const parts = rows.filter((r) => r[key] > 0).map((r) => `${r.value} ${r[key]}`);
		return parts.length > 0 ? parts.join('・') : '不明';
	}
</script>

<!-- 重賞の傾向 → レースの条件と前哨戦 → 過去の好走馬（要約と導線） → 重賞のタイムライン → 同じ条件のレースメモ → コースの特徴 → コース図の順。
     同じ条件のメモからは、重賞のタイムラインに出るレースを load が SQL で除いてある。
     重賞のタイムラインは重賞（G1〜G3 で名前あり）だけ。基本情報（開催日・発走・条件・頭数）は見出しに載せている。 -->
<div class="grid gap-6">
	{#if graded}<GradedRaceTrend raceKey={graded.key} body={graded.trend} />{/if}
	{#if graded?.profile}<RaceConditions profile={graded.profile} {today} />{/if}
	{#if graded}
		{@const pl = graded.placers}
		<section aria-labelledby="{id}-placers">
			<div class="flex flex-wrap items-baseline justify-between gap-x-3">
				<h2 id="{id}-placers" class="text-sm font-semibold text-muted-foreground">
					過去の好走馬
					<span class="font-normal">{pl.fromYear}〜{pl.toYear}年の1〜3着</span>
				</h2>
				<a
					href="{resolve('/graded-races/[name]', {
						name: gradedRaceParam(graded.key)
					})}#graded-placers"
					class="inline-flex min-h-6 items-center text-xs text-muted-foreground underline-offset-2 hover:underline"
				>
					重賞の画面で見る
				</a>
			</div>
			{#if pl.placers === 0}
				<p class="mt-2 text-sm text-muted-foreground">
					{pl.fromYear}〜{pl.toYear}年のこのレースの結果は、まだ登録されていません。
				</p>
			{:else}
				<p class="mt-2 text-sm">
					結果のある開催 {pl.races}{#if pl.missing > 0}・未登録 {pl.missing}{/if}
				</p>
				<dl class="mt-1 grid gap-1 text-sm">
					<div class="flex gap-3">
						<dt class="w-28 shrink-0 text-muted-foreground">勝ち馬の人気</dt>
						<dd class="min-w-0 break-words">{popularityText(pl.popularity, 'wins')}</dd>
					</div>
					<div class="flex gap-3">
						<dt class="w-28 shrink-0 text-muted-foreground">3着以内の人気</dt>
						<dd class="min-w-0 break-words">{popularityText(pl.popularity, 'placed')}</dd>
					</div>
				</dl>
				<p class="mt-2 text-xs text-muted-foreground">
					騎手・父・母父ごとの数と年ごとの一覧は、重賞の画面にあります。
				</p>
			{/if}
		</section>
		<section aria-labelledby="{id}-timeline">
			<div class="flex flex-wrap items-baseline justify-between gap-x-3">
				<h2 id="{id}-timeline" class="text-sm font-semibold text-muted-foreground">
					重賞のタイムライン
					<span class="font-normal">{graded.key}</span>
				</h2>
				<a
					href={resolve('/graded-races/[name]', { name: gradedRaceParam(graded.key) })}
					class="inline-flex min-h-6 items-center text-xs text-muted-foreground underline-offset-2 hover:underline"
				>
					重賞の画面で見る
				</a>
			</div>
			{#if graded.timeline.length === 0}
				<p class="mt-2 text-sm text-muted-foreground">
					ほかの年のこのレースは、まだ登録されていません。
				</p>
			{:else}
				<GradedRaceTimeline timeline={graded.timeline} {today} />
			{/if}
		</section>
	{/if}
	<section aria-labelledby="{id}-same-condition">
		<h2 id="{id}-same-condition" class="text-sm font-semibold text-muted-foreground">
			同じ条件で書いたレースのメモ
			{#if condition}<span class="font-normal">（{condition}）</span>{/if}
		</h2>
		{#if sameCondition.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">
				{graded
					? 'ほかに同じ条件で書いたレースのメモはありません。'
					: '同じ条件のレースメモはまだありません。'}
			</p>
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
	{#if graded?.profile}<CourseFeatures {race} course={graded.profile.course} />{/if}
	<CourseMap {race} />
</div>
