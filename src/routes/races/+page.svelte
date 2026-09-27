<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import LoadMore from '$lib/components/LoadMore.svelte';
	import RaceFilterForm from '$lib/components/RaceFilterForm.svelte';
	import RaceListEmpty from '$lib/components/RaceListEmpty.svelte';
	import { opensReview } from '$lib/utils/date';
	import { PagedList } from '$lib/utils/paged-list.svelte';
	import { pageHref } from '$lib/utils/paging';
	import { hasRaceFilter } from '$lib/utils/race-filter';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));
	const filtered = $derived(hasRaceFilter(data.filter));

	// 100件ずつ。下端に近づいたら次の100件を足す（→ PagedList / LoadMore）。
	const races = new PagedList(
		() => ({ url: page.url, page: data.races }),
		(next) => next.races as typeof data.races
	);
	export const snapshot = races.snapshot;
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

	{#if data.total === 0}
		<RaceListEmpty defaultFilter={data.defaultFilter} {filtered} {admin} />
	{:else}
		<p class="mt-6 text-xs text-gray-500">
			{data.total} 件
			{#if data.offset > 0}
				<!-- JS が無いときは「続きを読み込む」で offset 付きのページへ移るので、先頭へ戻る道を置く。 -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは今開いている URL のまま、offset を外しているだけ（frontend.md 第3章） -->
				・{data.offset + 1} 件目から
				<a href={pageHref(page.url, 0)} class="underline">先頭から見る</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</p>
		<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
			{#each races.items as r (r.id)}
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
							<!-- 格の札は一覧の行ではレース名の前（product.md 第6章）。
							     条件戦のクラスは札の代わりなので、同じ位置に置く。 -->
							{#if r.grade}
								<GradeBadge grade={r.grade} />
							{:else if r.className}
								<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
									{r.className}
								</span>
							{/if}
							<span class="font-medium">{r.name ?? '（レース名未設定）'}</span>
						</div>
						<div class="mt-0.5 text-xs text-gray-500">
							{r.surface ?? ''}{r.distance ? `${r.distance}m` : ''}
							・出走 {r.entryCount} 頭 ・メモ {r.noteCount} 件
						</div>
					</a>
				</li>
			{/each}
		</ul>
		<LoadMore
			href={races.href}
			load={() => races.loadNext()}
			shown={data.offset + races.items.length}
			unit="件"
		/>
	{/if}
</main>
