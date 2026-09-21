<script lang="ts">
	import { resolve } from '$app/paths';
	import ShareControl from '$lib/components/ShareControl.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import NoteTag from '$lib/components/NoteTag.svelte';
	import { noteHeading } from '$lib/utils/note';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">最近のメモ</h1>

	{#if data.notes.length === 0}
		<div class="mt-6 rounded-md border border-gray-200 p-4">
			<p class="text-sm text-gray-600">まだメモがありません。</p>
			<p class="mt-2 text-sm text-gray-500">
				<a href={resolve('/races/new')} class="underline">レースを登録</a>
				→ 出走馬を入力 → ふりかえり、の順で書けます。
			</p>
		</div>
	{:else}
		<ol class="mt-6 space-y-5">
			{#each data.notes as n (n.id)}
				{@const h = noteHeading(n)}
				<li class="border-l-2 border-gray-200 pl-4">
					<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
						<span class="font-mono text-gray-500">{n.occurredAt}</span>
						<NoteTag tag={h.tag} />
						{#if n.raceId}
							<a href={resolve('/races/[id]', { id: n.raceId })} class="hover:underline">
								{n.horseName ? `${n.horseName} ${h.label}` : h.label}
							</a>
						{:else}
							<span>{h.label}</span>
						{/if}
						<SharedBadge visibility={n.visibility} />
					</div>
					<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
					{#if n.rating}
						<p class="mt-1 text-xs text-amber-500">{'★'.repeat(n.rating)}</p>
					{/if}
					<div class="mt-2">
						<ShareControl noteId={n.id} visibility={n.visibility} redirectTo="/" />
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	<section class="mt-10">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-gray-500">直近のレース</h2>
			<span class="flex-1"></span>
			<a href={resolve('/races/new')} class="text-sm text-gray-600 hover:underline">＋ 登録</a>
		</div>

		{#if data.races.length === 0}
			<p class="mt-2 text-sm text-gray-500">まだありません。</p>
		{:else}
			<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
				{#each data.races as r (r.id)}
					<li>
						<a
							href={resolve('/races/[id]', { id: r.id })}
							class="block py-2.5 text-sm hover:bg-gray-50"
						>
							<span class="font-mono text-gray-500">{r.date}</span>
							<span class="ml-2">{r.course}{r.raceNumber ?? ''}R</span>
							<span class="ml-2 font-medium">{r.name ?? ''}</span>
							<span class="ml-2 text-xs text-gray-500">メモ {r.noteCount}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
