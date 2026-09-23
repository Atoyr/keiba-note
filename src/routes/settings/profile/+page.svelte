<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>プロフィール — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">プロフィール</h1>

	<dl class="mt-6 rounded-lg border border-gray-200 px-4 py-3">
		<dt class="text-xs text-gray-500">ユーザー名</dt>
		<dd class="mt-0.5 text-sm font-medium">{data.displayName}</dd>
	</dl>

	<p class="mt-3 text-xs text-gray-500">
		初回ログイン時に Google アカウントから取り込んだ表示名です。ここでは変更できません。
	</p>
</main>
