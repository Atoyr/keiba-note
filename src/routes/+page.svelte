<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>keiba-note</title></svelte:head>

<main class="mx-auto max-w-2xl px-6 py-16">
	<h1 class="text-3xl font-bold tracking-tight">keiba-note</h1>
	<p class="mt-2 text-gray-600">競馬の観戦メモを、レース単位／馬単位でふりかえる。</p>

	<div class="mt-8 rounded-lg border border-gray-200 p-4">
		<h2 class="text-sm font-semibold text-gray-500">Phase 0 — 疎通確認</h2>
		<p class="mt-2 flex items-center gap-2">
			<span
				class="inline-block size-2 rounded-full {data.db.ok ? 'bg-green-500' : 'bg-red-500'}"
				aria-hidden="true"
			></span>
			<span>{data.db.detail}</span>
		</p>
	</div>

	<p class="mt-8 text-sm text-gray-500">
		画面の実装は Phase 1 以降。<code>docs/design.md</code> 第8章を参照。
	</p>
</main>
