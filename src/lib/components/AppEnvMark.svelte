<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import faviconStaging from '$lib/assets/favicon-staging.svg';
	import touchIcon from '$lib/assets/apple-touch-icon.png';
	import touchIconStaging from '$lib/assets/apple-touch-icon-staging.png';

	/**
	 * いま開いているのが本番かステージングかを見分ける印。
	 *
	 * ステージングはリリース前に**本番と同じ見た目で**確かめる場所なので、テーマカラーは変えない。
	 * 変えるのはタブのアイコン（灰色の蹄鉄）と、ページの一番上の細い帯だけ（docs/design-system.md 2-4）。
	 * 帯は共有ページにも出す。著者も第三者も同じ帯を見るので、同じ見え方という要件は崩れない。
	 */
	let { staging }: { staging: boolean } = $props();
</script>

<svelte:head>
	<link rel="icon" href={staging ? faviconStaging : favicon} />
	<link rel="apple-touch-icon" href={staging ? touchIconStaging : touchIcon} />
	<meta name="theme-color" content="#7a4a1e" />
</svelte:head>

{#if staging}
	<div class="bg-foreground py-0.5 text-center text-xs text-background">
		ステージング環境（データは本番と別）
	</div>
{/if}
