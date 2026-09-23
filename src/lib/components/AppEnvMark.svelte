<script lang="ts">
	import { asset } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import faviconStaging from '$lib/assets/favicon-staging.svg';

	/**
	 * いま開いているのが本番かステージングかを見分ける印。
	 *
	 * ステージングはリリース前に**本番と同じ見た目で**確かめる場所なので、テーマカラーは変えない。
	 * 変えるのはタブのアイコン（暗い地に灰色の蹄鉄）と、ページの一番上の細い帯だけ
	 * （docs/design-system.md 2-4）。アイコンは色だけでなく明るさも逆にして、16px のタブでも見分けられるようにした。
	 * 帯は共有ページにも出す。著者も第三者も同じ帯を見るので、同じ見え方という要件は崩れない。
	 *
	 * ホーム画面のアイコン（apple-touch-icon）は `static/` に置いてパスで指す。
	 * `$lib/assets` から import すると小さい画像は data URL に埋め込まれ、iOS が拾わないことがある。
	 */
	let { staging }: { staging: boolean } = $props();
</script>

<svelte:head>
	<link rel="icon" href={staging ? faviconStaging : favicon} />
	<link
		rel="apple-touch-icon"
		href={asset(staging ? '/apple-touch-icon-staging.png' : '/apple-touch-icon.png')}
	/>
	<meta name="theme-color" content="#1e3a5f" />
</svelte:head>

{#if staging}
	<div class="bg-foreground py-0.5 text-center text-xs text-background">
		ステージング環境（データは本番と別）
	</div>
{/if}
