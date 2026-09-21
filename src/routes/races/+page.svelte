<script lang="ts">
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));
</script>

<svelte:head><title>レース — k-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-bold tracking-tight">レース</h1>
		<span class="flex-1"></span>
		{#if admin}
			<a
				href={resolve('/races/new')}
				class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
			>
				レースを登録
			</a>
		{/if}
	</div>

	{#if data.races.length === 0}
		<p class="mt-8 text-sm text-gray-500">
			{#if admin}
				まだレースがありません。まずは1つ登録してみてください。
			{:else}
				まだレースがありません。
			{/if}
		</p>
	{:else}
		<ul class="mt-6 divide-y divide-gray-200 border-y border-gray-200">
			{#each data.races as r (r.id)}
				<li>
					<a href={resolve('/races/[id]', { id: r.id })} class="block py-3 hover:bg-gray-50">
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
