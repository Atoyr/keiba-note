<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';

	/**
	 * プライバシーポリシーと利用規約の枠。見出し・日付・末尾の戻り先を揃える。
	 * 本文の段落や箇条書きのクラスは、それぞれのページに書く。
	 */
	let {
		title,
		enactedOn,
		updatedOn,
		children
	}: {
		title: string;
		/** 制定日。変えない。 */
		enactedOn: string;
		/** 最終改定日。文面を変えたら更新する。 */
		updatedOn: string;
		children: Snippet;
	} = $props();
</script>

<svelte:head><title>{title} — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">{title}</h1>
	<p class="mt-1 text-xs text-gray-500">
		制定: {enactedOn}{#if updatedOn !== enactedOn}／最終改定: {updatedOn}{/if}
	</p>

	<div class="mt-6 text-sm leading-relaxed">
		{@render children()}
	</div>

	<p class="mt-10 border-t border-gray-200 pt-4 text-sm">
		<a href={resolve('/')} class="text-gray-600 underline hover:no-underline">uma-memo へ戻る</a>
	</p>
</main>
