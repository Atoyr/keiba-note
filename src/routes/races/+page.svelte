<script lang="ts">
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import RaceFilterForm from '$lib/components/RaceFilterForm.svelte';
	import { opensReview } from '$lib/utils/date';
	import { hasRaceFilter } from '$lib/utils/race-filter';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));
	const filtered = $derived(hasRaceFilter(data.filter));
</script>

<svelte:head><title>レース — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-bold tracking-tight">レース</h1>
		<span class="flex-1"></span>
		{#if admin}
			<a
				href={resolve('/races/new')}
				class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
			>
				レースを登録
			</a>
		{/if}
	</div>

	<RaceFilterForm filter={data.filter} years={data.years} />

	{#if data.races.length === 0}
		<p class="mt-8 text-sm text-gray-500">
			{#if filtered}
				条件に合うレースがありません。
			{:else if admin}
				まだレースがありません。まずは1つ登録してみてください。
			{:else}
				まだレースがありません。
			{/if}
		</p>
	{:else}
		<p class="mt-6 text-xs text-gray-500">{data.races.length} 件</p>
		<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
			{#each data.races as r (r.id)}
				<li>
					<!-- 一覧は日付降順なので、上のほうには開催前の重賞が並ぶ。
					     結果が出たもの・ふりかえりを書いたものだけふりかえりへ、それ以外は予想画面へ送る
					     （→ opensReview）。 -->
					<a
						href={opensReview(r, data.today, r.reviewCount > 0)
							? resolve('/races/[id]', { id: r.id })
							: resolve('/races/[id]/preview', { id: r.id })}
						class="block py-3 hover:bg-gray-50"
					>
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<span class="font-mono text-sm text-gray-500">{r.date}</span>
							<span class="text-sm">{r.course}{r.raceNumber ?? ''}R</span>
							<span class="font-medium">{r.name ?? '（レース名未設定）'}</span>
							{#if r.grade}
								<GradeBadge grade={r.grade} />
							{:else if r.className}
								<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
									{r.className}
								</span>
							{/if}
						</div>
						<div class="mt-0.5 text-xs text-gray-500">
							{r.surface ?? ''}{r.distance ? `${r.distance}m` : ''}
							・出走 {r.entryCount} 頭 ・メモ {r.noteCount} 件
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
