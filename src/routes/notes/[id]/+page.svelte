<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import Stars from '$lib/components/Stars.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const n = $derived(data.note);

	/**
	 * 1件で閉じていること自体が「検索で辿り着けない」を支えている。
	 * **アプリ内へのリンク、同じ著者の他のメモ、一覧への戻りは出さない**（design.md 第6章）。
	 */
	const raceLine = $derived(
		[n.raceDate, n.course && n.raceNumber ? `${n.course}${n.raceNumber}R` : n.course, n.raceName]
			.filter(Boolean)
			.join(' ')
	);
</script>

<svelte:head>
	<title>メモ — keiba-note</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="mx-auto max-w-2xl px-4 py-10 sm:px-6">
	<article class="rounded-lg border border-gray-200 p-5 sm:p-6">
		{#if raceLine}
			<p class="flex flex-wrap items-center gap-2 text-sm text-gray-600">
				<span>{raceLine}</span>
				<GradeBadge grade={n.grade} />
			</p>
		{/if}

		{#if n.horseName}
			<p class="mt-1 flex flex-wrap items-center gap-2">
				<span class="text-lg font-bold tracking-tight">{n.horseName}</span>
				{#if n.finishPosition}
					<span class="text-sm text-gray-600">{n.finishPosition}着</span>
				{/if}
				<MarkBadge mark={n.mark} />
			</p>
		{/if}

		{#if n.body}
			<p class="mt-4 text-[15px] leading-relaxed whitespace-pre-wrap">{n.body}</p>
		{/if}

		<div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
			<Stars rating={n.rating} />
			<span>— {n.authorName}</span>
		</div>
	</article>

	<p class="mt-4 text-center text-xs text-gray-400">
		リンクを知っている人だけが見られるメモです。検索には出ません。
	</p>
</main>
