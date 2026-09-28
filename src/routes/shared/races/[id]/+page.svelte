<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RaceSummary from '$lib/components/RaceSummary.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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
	<meta name="twitter:image:alt" content={ogDescription} />
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<RaceSummary summary={data.content} authorName={data.authorName} />
	<p class="mt-6 text-center text-xs text-muted-foreground">
		共有時点の予想です。リンクを知っている人だけが見られます。
	</p>

	<!-- SNS で流れてきて初めて見る人への入口。まとめを読み終えた一番下に置き、本体の邪魔をしない。
	     ログイン中（本人を含む）には要らないので出さない（product.md「予想まとめ」）。 -->
	{#if !data.signedIn}
		<!-- 見出しと余白はまとめの区画（RaceSummary）と揃える。本体より強い見出しにしない。 -->
		<aside aria-labelledby="guest-guide-heading" class="mt-10 rounded-lg border p-4">
			<h2 id="guest-guide-heading" class="text-sm font-semibold">uma-memo で予想を書く</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
				この予想まとめは uma-memo
				で作られています。出馬表を見ながら印とメモを付け、レースのあとにふりかえる観戦メモです。Google
				アカウントがあれば無料で使えます。
			</p>
			<div class="mt-4 flex flex-col gap-2 sm:flex-row">
				<Button href={resolve('/login')} size="lg" class="h-11 px-4">ログインして始める</Button>
				<Button href={resolve('/')} variant="outline" size="lg" class="h-11 px-4">
					できることを見る
				</Button>
			</div>
		</aside>
	{/if}
</main>
