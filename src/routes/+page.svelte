<script lang="ts">
	import { resolve } from '$app/paths';
	import ShareControl from '$lib/components/ShareControl.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import { noteHeading } from '$lib/utils/note';
	import { formatDateShort } from '$lib/utils/date';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';
	import type { RaceListItem } from '$lib/server/services/races';

	let { data }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	const weekLabel = $derived(
		`${formatDateShort(data.week.start)} 〜 ${formatDateShort(data.week.end)}`
	);
</script>

<!-- 今週も過去も同じ行。違うのは並び順と、どの窓から取ってくるかだけ。 -->
{#snippet raceList(races: RaceListItem[])}
	<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
		{#each races as r (r.id)}
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
{/snippet}

<svelte:head><title>k-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">最近のメモ</h1>

	{#if data.notes.length === 0}
		<div class="mt-6 rounded-md border border-gray-200 p-4">
			<p class="text-sm text-gray-600">まだメモがありません。</p>
			{#if admin}
				<p class="mt-2 text-sm text-gray-500">
					<a href={resolve('/races/new')} class="underline">レースを登録</a>
					→ 出走馬を入力 → ふりかえり、の順で書けます。
				</p>
			{:else}
				<p class="mt-2 text-sm text-gray-500">
					<a href={resolve('/races')} class="underline">レース</a>
					から書きたいレースを開くと、その場でメモを書けます。
				</p>
			{/if}
		</div>
	{:else}
		<ol class="mt-6 space-y-5">
			{#each data.notes as n (n.id)}
				{@const h = noteHeading(n)}
				<li class="border-l-2 border-gray-200 pl-4">
					<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
						<span class="font-mono text-gray-500">{n.occurredAt}</span>
						<KindBadge label={h.kindLabel} />
						{#if n.raceId}
							<a href={resolve('/races/[id]', { id: n.raceId })} class="hover:underline">
								{n.horseName ? `${n.horseName} ${h.label}` : h.label}
							</a>
						{:else}
							<span>{h.label}</span>
						{/if}
						<SharedBadge visibility={n.visibility} />
					</div>
					{#if n.body}
						<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
					{/if}
					<TagBadges tags={n.tags} class="mt-1" />
					<div class="mt-2">
						<ShareControl noteId={n.id} visibility={n.visibility} redirectTo="/" />
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	<section class="mt-10">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h2 class="text-sm font-semibold text-gray-500">今週のレース</h2>
			<span class="text-xs text-gray-500">{weekLabel}</span>
			<span class="flex-1"></span>
			{#if admin}
				<a href={resolve('/races/new')} class="text-sm text-gray-600 hover:underline">＋ 登録</a>
			{/if}
		</div>

		{#if data.thisWeek.length === 0}
			<p class="mt-2 text-sm text-gray-500">今週のレースはまだ登録されていません。</p>
		{:else}
			{@render raceList(data.thisWeek)}
		{/if}
	</section>

	<section class="mt-8">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h2 class="text-sm font-semibold text-gray-500">過去のレース</h2>
			<span class="text-xs text-gray-500">直近{data.pastWeeks}週</span>
		</div>

		{#if data.past.length === 0}
			<p class="mt-2 text-sm text-gray-500">直近{data.pastWeeks}週に終わったレースはありません。</p>
		{:else}
			{@render raceList(data.past)}
		{/if}
	</section>

	<p class="mt-4 text-sm">
		<a href={resolve('/races')} class="text-gray-600 hover:underline">すべてのレースを見る →</a>
	</p>
</main>
