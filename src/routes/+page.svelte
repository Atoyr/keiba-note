<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="text-2xl font-bold tracking-tight">ようこそ</h1>
	<p class="mt-1 text-gray-600">競馬の観戦メモを、レース単位／馬単位でふりかえる。</p>

	<div class="mt-8 rounded-lg border border-gray-200 p-4">
		<h2 class="text-sm font-semibold text-gray-500">Phase 1 — 認証まで完了</h2>
		<p class="mt-2 flex items-center gap-2 text-sm">
			<span
				class="inline-block size-2 rounded-full {data.db.ok ? 'bg-green-500' : 'bg-red-500'}"
				aria-hidden="true"
			></span>
			<span>{data.db.detail}</span>
		</p>
	</div>

	<p class="mt-8 text-sm text-gray-500">
		馬・レースの登録は Phase 2、メモは Phase 3。<code>docs/design.md</code> 第8章を参照。
	</p>
</main>
