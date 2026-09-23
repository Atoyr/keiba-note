<script lang="ts">
	import { resolve } from '$app/paths';
	import GoogleLogin from '$lib/components/GoogleLogin.svelte';

	/**
	 * 未ログインで `/` を開いた人に出す紹介ページ。Google の同意画面の「ホームページ」でもある
	 * （docs/operations.md）。
	 *
	 * タイトルと説明文は `src/routes/+page.svelte` の `<svelte:head>` にある。
	 *
	 * **データは何も出さない。** `/` は未ログインでも開けるので、ここに DB の値を載せると
	 * そのまま誰にでも見える。書いてあることはすべて固定の文で、実装と合わせておく。
	 */
	const FEATURES = [
		{
			title: 'レースをふりかえる',
			body: '見終わったレースについて、ペースや馬場などレースそのもののことと、出走馬それぞれの走りを1つの画面でまとめて書けます。'
		},
		{
			title: '馬ごとに読み返す',
			body: '書いたメモは馬ごとに時系列で並びます。次にその馬が走る前に、これまで自分が書いてきたことを一度に読み返せます。'
		},
		{
			title: '予想と答え合わせ',
			body: '開催前に出馬表を見ながら見立てと予想印を書き、走ったあとのふりかえりと見比べられます。予想したのにふりかえっていない直近のレースは、トップに並びます。'
		}
	] as const;
</script>

<main class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
	<section class="max-w-xl">
		<h1 class="text-3xl font-bold tracking-tight">uma-memo</h1>
		<p class="mt-2 text-lg">競馬の観戦メモを、レース単位／馬単位でふりかえる。</p>
		<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
			レースを見終わったら、気づいたことをその場で書き留める。書いたメモは馬ごとに積み重なり、次のレースで同じ馬を狙うときの手がかりになります。
		</p>
		<div class="mt-6 max-w-md">
			<GoogleLogin />
		</div>
	</section>

	<section class="mt-12 border-t pt-8">
		<h2 class="text-base font-bold">できること</h2>
		<dl class="mt-4 grid gap-6 sm:grid-cols-3">
			{#each FEATURES as f (f.title)}
				<div>
					<dt class="text-sm font-bold">{f.title}</dt>
					<dd class="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class="mt-12 border-t pt-8">
		<h2 class="text-base font-bold">メモは自分だけのもの</h2>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			書いたメモは既定で非公開で、書いた本人しか読めません。人に見せたいメモだけ、1件ずつ共有リンクを発行して渡せます。共有したメモは検索には出ず、いつでも共有をやめられます。
		</p>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			レースと出走馬は運営者がまとめて登録します（JRA の重賞が中心です）。使うのに必要なのは Google
			アカウントだけで、料金はかかりません。
		</p>
	</section>

	<footer class="mt-12 flex gap-4 border-t pt-4 text-xs text-muted-foreground">
		<a
			href={resolve('/terms')}
			class="inline-flex min-h-6 items-center underline hover:no-underline">利用規約</a
		>
		<a
			href={resolve('/privacy')}
			class="inline-flex min-h-6 items-center underline hover:no-underline">プライバシーポリシー</a
		>
	</footer>
</main>
