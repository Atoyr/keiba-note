<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const raceId = $derived(page.params.id ?? '');
	const entryId = $derived(form && 'entryId' in form ? form.entryId : null);
</script>

<svelte:head><title>気づき — uma-memo</title></svelte:head>

<!-- JS が無いときに、気づきの保存の結果を出す画面。JS があれば fetch で送るので、ここは開かない。 -->
<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">気づき</h1>

	{#if form && 'message' in form && form.message}
		<p
			class="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
			role="alert"
		>
			{form.message}
		</p>
	{:else if form && 'words' in form}
		<p class="mt-4 rounded-lg border bg-muted px-3 py-2 text-sm text-foreground" role="status">
			保存しました
		</p>
	{:else}
		<p class="mt-4 text-sm text-muted-foreground">
			気づきは、ふりかえり画面の出走馬の行から残せます。
		</p>
	{/if}

	<p class="mt-6 text-sm">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは resolve() で組み、行の位置（#entry-…）だけを足す -->
		<a
			href="{resolve('/races/[id]', { id: raceId })}{entryId ? `#entry-${entryId}` : ''}"
			class="underline underline-offset-2"
		>
			ふりかえりに戻る
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</p>
</main>
