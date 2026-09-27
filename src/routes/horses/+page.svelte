<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LoadMore from '$lib/components/LoadMore.svelte';
	import { PagedList } from '$lib/utils/paged-list.svelte';
	import { pageHref } from '$lib/utils/paging';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// 100頭ずつ。下端に近づいたら次の100頭を足す（→ PagedList / LoadMore）。
	const horses = new PagedList(
		() => ({ url: page.url, page: data.horses }),
		(next) => next.horses as typeof data.horses
	);
	export const snapshot = horses.snapshot;

	let listEl = $state<HTMLElement>();
</script>

<svelte:head><title>馬 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">馬</h1>
	<p class="mt-1 text-sm text-gray-600">
		馬は出走馬の入力で自動的に登録されます。名前で絞り込めます。
	</p>

	<form method="GET" action={resolve('/horses')} class="mt-4 flex gap-2">
		<input
			name="q"
			value={data.q}
			placeholder="馬名で検索"
			class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
		/>
		<button
			type="submit"
			class="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
		>
			検索
		</button>
	</form>

	{#if data.horses.items.length === 0 && data.offset === 0}
		<p class="mt-8 text-sm text-gray-500">
			{data.q ? '見つかりませんでした。' : 'まだ馬がいません。レースに出走馬を入力すると増えます。'}
		</p>
	{:else}
		{#if data.offset > 0}
			<!-- JS が無いときは「続きを読み込む」で offset 付きのページへ移るので、先頭へ戻る道を置く。 -->
			<p class="mt-6 text-xs text-muted-foreground">
				{data.offset + 1} 頭目から
				<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは今開いている URL のまま、offset を外しているだけ（frontend.md 第3章） -->
				<a href={pageHref(page.url, 0)} class="underline">先頭から見る</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</p>
		{/if}
		<ul bind:this={listEl} class="mt-6 divide-y divide-gray-200 border-y border-gray-200">
			{#each horses.items as h (h.id)}
				<li>
					<a href={resolve('/horses/[id]', { id: h.id })} class="block py-3 hover:bg-gray-50">
						<div class="flex flex-wrap items-baseline gap-x-2">
							<span class="font-medium">{h.name}</span>
							{#if h.sex}<span class="text-xs text-gray-500">{h.sex}</span>{/if}
							{#if h.trainer}<span class="text-xs text-gray-500">{h.trainer}</span>{/if}
						</div>
						<div class="mt-0.5 text-xs text-gray-500">
							出走 {h.entryCount} 戦 ・メモ {h.noteCount} 件
						</div>
					</a>
				</li>
			{/each}
		</ul>
		<LoadMore
			href={horses.href}
			load={() => horses.loadNext()}
			list={listEl}
			shown={data.offset + horses.items.length}
			unit="頭"
		/>
	{/if}
</main>
