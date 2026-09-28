<script lang="ts">
	import { resolve } from '$app/paths';
	import RaceSummary from '$lib/components/RaceSummary.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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

	<!-- SNS で流れてきて初めて見る人への入口。まとめを読み終えた一番下に置き、本体の邪魔をしない。
	     ログイン中（本人を含む）には要らないので出さない（product.md「予想まとめ」）。 -->
	{#if !data.signedIn}
		<aside aria-labelledby="guest-guide-heading" class="mt-10 rounded-lg border p-5 sm:p-6">
			<h2 id="guest-guide-heading" class="text-base font-bold">uma-memo で予想を書く</h2>
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
