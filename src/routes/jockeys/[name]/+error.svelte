<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	/**
	 * 騎手の画面の失敗。**騎手は名前で束ねている**ので、取得元の表記が変わる（`レーン` → `D.レーン`）と
	 * 前に開いたリンクが無い騎手になる。既定のエラー画面では次にどうすればよいかが分からないので、一覧へ戻す。
	 */
</script>

<svelte:head><title>騎手 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	{#if page.status === 404}
		<h1 class="text-2xl font-bold tracking-tight">騎手が見つかりません</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			この名前の騎乗が入っていません。名前の表記が変わったのかもしれません。
		</p>
	{:else}
		<h1 class="text-2xl font-bold tracking-tight">騎手の画面を開けませんでした</h1>
		<p class="mt-2 text-sm text-muted-foreground">時間をおいて開き直してください。</p>
	{/if}
	<p class="mt-4 text-sm">
		<a href={resolve('/jockeys')} class="underline underline-offset-2">騎手の一覧で探す</a>
	</p>
</main>
