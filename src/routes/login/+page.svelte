<script lang="ts">
	import GoogleLogin from '$lib/components/GoogleLogin.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>ログイン — uma-memo</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
	<h1 class="text-2xl font-bold tracking-tight">uma-memo</h1>
	<p class="mt-1 text-sm text-gray-600">競馬の観戦メモを、レース単位／馬単位でふりかえる。</p>

	{#if data.errorMessage}
		<p
			class="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{data.errorMessage}
		</p>
	{/if}

	<div class="mt-6">
		<GoogleLogin redirectTo={data.redirectTo} />
	</div>

	<p class="mt-6 text-xs text-gray-500">
		Google アカウントがあればそのまま使えます。書いたメモは既定で非公開で、
		共有したいものだけリンクを発行して渡します。
	</p>
</main>
