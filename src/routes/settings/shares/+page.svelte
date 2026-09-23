<script lang="ts">
	import ShareControl from '$lib/components/ShareControl.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>共有中のメモ — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">共有中のメモ</h1>
	<p class="mt-1 text-sm text-gray-600">
		リンクを知っている人が見られる状態のメモです。共有をやめると、その URL はすぐ開けなくなります。
	</p>

	{#if data.notes.length === 0}
		<p class="mt-8 text-sm text-gray-500">共有しているメモはありません。</p>
	{:else}
		<ul class="mt-6 space-y-3">
			{#each data.notes as n (n.id)}
				<li class="rounded-lg border border-gray-200 p-4">
					<p class="text-xs text-gray-500">
						{n.occurredAt}
						{#if n.horseName}・{n.horseName}{/if}
						{#if n.raceName}・{n.raceName}{/if}
					</p>
					{#if n.body}
						<p class="mt-1 line-clamp-2 text-sm whitespace-pre-wrap">{n.body}</p>
					{/if}
					<div class="mt-2">
						<ShareControl noteId={n.id} visibility={n.visibility} redirectTo="/settings/shares" />
					</div>
				</li>
			{/each}
		</ul>

		<p class="mt-6 text-xs text-gray-500">
			共有をやめても URL
			は変わりません。もう一度共有すると、以前リンクを渡した相手がまた見られます。
		</p>
	{/if}
</main>
