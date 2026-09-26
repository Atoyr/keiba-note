<script lang="ts">
	import RaceSummary from '$lib/components/RaceSummary.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.content.race.name ?? data.content.race.meeting} 予想まとめ — uma-memo</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<RaceSummary summary={data.content} authorName={data.authorName} />
	<p class="mt-6 text-center text-xs text-muted-foreground">
		共有時点の予想です。リンクを知っている人だけが見られます。
	</p>
</main>
