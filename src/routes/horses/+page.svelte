<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
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

	{#if data.horses.length === 0}
		<p class="mt-8 text-sm text-gray-500">
			{data.q ? '見つかりませんでした。' : 'まだ馬がいません。レースに出走馬を入力すると増えます。'}
		</p>
	{:else}
		<ul class="mt-6 divide-y divide-gray-200 border-y border-gray-200">
			{#each data.horses as h (h.id)}
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
	{/if}
</main>
