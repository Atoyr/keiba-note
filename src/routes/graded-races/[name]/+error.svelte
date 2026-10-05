<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	/**
	 * 重賞の画面の失敗。**重賞はレース名で束ねている**ので、名前が変わった重賞や、重賞でない名前のリンクは
	 * 開けない。既定のエラー画面では次にどうすればよいかが分からないので、一覧へ戻す。
	 */
</script>

<svelte:head><title>重賞 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	{#if page.status === 404}
		<h1 class="text-2xl font-bold tracking-tight">重賞が見つかりません</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			この名前の重賞のレースが入っていません。名前の表記が変わったのかもしれません。
		</p>
	{:else}
		<h1 class="text-2xl font-bold tracking-tight">重賞の画面を開けませんでした</h1>
		<p class="mt-2 text-sm text-muted-foreground">時間をおいて開き直してください。</p>
	{/if}
	<p class="mt-4 text-sm">
		<a href={resolve('/graded-races')} class="underline underline-offset-2">重賞の一覧で探す</a>
	</p>
</main>
