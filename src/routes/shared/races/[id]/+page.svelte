<script lang="ts">
	import { page } from '$app/state';
	import RaceSummary from '$lib/components/RaceSummary.svelte';
	import {
		CARD_HEIGHT,
		CARD_WIDTH,
		cardDescription,
		cardTitle,
		cardVersion
	} from '$lib/utils/share-card';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();

	// SNS に貼ったときのプレビュー（OGP）。印は画像に描き、説明文にも同じ並びを入れる（share-card.ts）。
	// 画像の URL に版（更新時刻と公開名から作る）を付け、描くものが変わったら別の画像として取り直させる。
	const ogTitle = $derived(cardTitle(data.content));
	const ogDescription = $derived(cardDescription(data.content, data.authorName));
	const ogImage = $derived(
		`${page.url.origin}/shared/races/${page.params.id}/og.png?v=${cardVersion(data.updatedAt, data.authorName)}`
	);
</script>

<svelte:head>
	<title>{data.content.race.name ?? data.content.race.meeting} 予想まとめ — uma-memo</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="uma-memo" />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content={String(CARD_WIDTH)} />
	<meta property="og:image:height" content={String(CARD_HEIGHT)} />
	<meta property="og:image:alt" content={ogDescription} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<RaceSummary summary={data.content} authorName={data.authorName} />
	<p class="mt-6 text-center text-xs text-muted-foreground">
		共有時点の予想です。リンクを知っている人だけが見られます。
	</p>
</main>
