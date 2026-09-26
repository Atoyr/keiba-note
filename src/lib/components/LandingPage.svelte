<script lang="ts">
	import { resolve } from '$app/paths';
	import GoogleLogin from '$lib/components/GoogleLogin.svelte';
	import dashboard from '$lib/assets/landing/dashboard.png';
	import flow from '$lib/assets/landing/flow.png';
	import horse from '$lib/assets/landing/horse.png';
	import previewEntry from '$lib/assets/landing/preview-entry.png';
	import preview from '$lib/assets/landing/preview.png';
	import review from '$lib/assets/landing/review.png';
	import sizes from '$lib/assets/landing/sizes.json';
	import summary from '$lib/assets/landing/summary.png';

	/**
	 * 未ログインで `/` を開いた人に出す紹介ページ。Google の同意画面の「ホームページ」でもある
	 * （docs/operations.md）。
	 *
	 * タイトルと説明文は `src/routes/+page.svelte` の `<svelte:head>` にある。
	 *
	 * **データは何も出さない。** `/` は未ログインでも開けるので、ここに DB の値を載せると
	 * そのまま誰にでも見える。書いてあることはすべて固定の文で、実装と合わせておく。
	 *
	 * 画面のキャプチャは `pnpm run landing:shots` が見本データ（架空の馬とレース）で撮った画像
	 * （`src/lib/assets/landing/`）。画面の見た目を変えたら撮り直す（docs/testing.md 第8章）。
	 */

	type Shot = { src: string; size: { width: number; height: number }; alt: string };
	type Feature = { title: string; body: string[]; shot: Shot };

	/**
	 * 使う順（開催前 → レースのあと → 次のレース）に並べる。
	 * 機能を一覧にするより、1週間のどこで何をするかで読めるほうが、使う場面が浮かぶ。
	 */
	const STAGES: { id: string; label: string; title: string; features: Feature[] }[] = [
		{
			id: 'before',
			label: '開催前',
			title: '出馬表を見ながら予想する',
			features: [
				{
					title: '1頭ずつ、印とメモ',
					body: [
						'出走馬ごとに ◎ ○ ▲ △ ☆ × の印と出走前メモを付けます。',
						'同じ欄に、単勝・複勝のオッズ（重賞のみ）、過去の成績、前に自分が付けた札（次走買い・不利 など）とメモが並ぶので、見比べながら決められます。'
					],
					shot: {
						src: previewEntry,
						size: sizes['preview-entry'],
						alt: '予想画面の出走馬の欄。◎の印、単勝と複勝のオッズ、過去2走の成績、前回付けた「次走買い」「不利」の札と過去のメモ、出走前メモが並んでいる'
					}
				},
				{
					title: 'レースの見立てとコース',
					body: [
						'馬場の想定や狙いどころは「レースの見立て」に。付けた印の一覧とコース図（回り・直線・高低差）が上に並びます。',
						'同じ競馬場・距離のレースで前に書いたメモも、ここに出てきます。'
					],
					shot: {
						src: preview,
						size: sizes.preview,
						alt: '予想画面の上部。レース名の下に、付けた印の一覧、中山芝のコース図、レースの見立ての欄が並んでいる'
					}
				},
				{
					title: '展開を盤面に置く',
					body: [
						'スタート・4コーナー・ゴール前の3つの場面で、どの馬がどこにいるかを盤面に置きます。ペースも選べます。',
						'閉じているときは「③-①⑥-④…」の隊列の1行になります。'
					],
					shot: {
						src: flow,
						size: sizes.flow,
						alt: '展開の予想の盤面。4コーナーの場面で、枠の色の丸に馬番を書いたコマが前後と内外のマス目に置かれている'
					}
				},
				{
					title: '予想をまとめて共有',
					body: [
						'見立て・展開・印・メモを1枚にまとめて見られます。',
						'人に見せたいときは共有リンクを作れます。リンクを開くのにログインは要りません。'
					],
					shot: {
						src: summary,
						size: sizes.summary,
						alt: '予想まとめの画面。レースの見立て、展開の予想、各馬のメモと印が1枚にまとまっている'
					}
				}
			]
		},
		{
			id: 'after',
			label: 'レースのあと',
			title: '走りをふりかえる',
			features: [
				{
					title: '答え合わせと、ふりかえり',
					body: [
						'予想で付けた印と着順が並び、どの印が馬券内に来たかが分かります。',
						'ペースや馬場などレースそのもののメモと、出走馬それぞれの走りを1つの画面で書けます。「次走買い」「次走消し」「不利」などの札も付けられます。'
					],
					shot: {
						src: review,
						size: sizes.review,
						alt: 'ふりかえり画面。答え合わせの欄に印と着順が並び、その下に開催前の見立てとレースのメモがある'
					}
				}
			]
		},
		{
			id: 'next',
			label: '次のレースへ',
			title: '書いたことを次に活かす',
			features: [
				{
					title: '馬ごとに読み返す',
					body: [
						'書いたメモは馬ごとに時系列で並びます。出走前のメモ、ふりかえり、近況のメモが1本のタイムラインになります。',
						'次にその馬が走る前に、これまで自分が書いてきたことを一度に読み返せます。'
					],
					shot: {
						src: horse,
						size: sizes.horse,
						alt: '馬のページ。出走前のメモ、近況のメモ、レースのふりかえりが日付の新しい順に並んでいる'
					}
				},
				{
					title: '開けば、今週やることが並ぶ',
					body: [
						'トップには、「次走買い」「次走消し」を付けた馬のうち今週走る馬と、予想したのにまだふりかえっていないレースが並びます。',
						'今週のレースと、直近3週のレースもここから開けます。'
					],
					shot: {
						src: dashboard,
						size: sizes.dashboard,
						alt: 'トップの画面。今週出走する注目馬、ふりかえり待ちのレース、今週のレースが並んでいる'
					}
				}
			]
		}
	];
</script>

<main class="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
	<section class="max-w-xl">
		<h1 class="text-3xl font-bold tracking-tight">uma-memo</h1>
		<p class="mt-2 text-lg">競馬の観戦メモを、レース単位／馬単位でふりかえる。</p>
		<p class="mt-4 text-sm leading-relaxed text-muted-foreground">
			開催前に予想を書き、レースを見終わったら気づいたことを書き留める。書いたメモは馬ごとに積み重なり、次のレースで同じ馬を狙うときの手がかりになります。
		</p>
		<div class="mt-6 max-w-md">
			<GoogleLogin />
		</div>
	</section>

	<!-- 3つの段階への目次。長いページなので、どこに何があるかを先に見せる。
	     ホバーは面を塗らず罫線の色だけを変える。bg-muted に text-muted-foreground の小さい文字が載ると
	     4.5:1 に届かない（約 4.35:1）。 -->
	<nav aria-label="使い方の流れ" class="mt-12 border-t pt-8">
		<ol class="grid gap-3 sm:grid-cols-3">
			{#each STAGES as stage, i (stage.id)}
				<li>
					<a
						href="#{stage.id}"
						class="flex min-h-11 items-baseline gap-2 rounded-lg border px-3 py-2 hover:border-primary"
					>
						<span class="font-mono text-xs text-muted-foreground">{i + 1}</span>
						<span>
							<span class="block text-xs text-muted-foreground">{stage.label}</span>
							<span class="block text-sm font-bold">{stage.title}</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</nav>

	{#each STAGES as stage, i (stage.id)}
		<section id={stage.id} aria-labelledby="{stage.id}-heading" class="mt-16 scroll-mt-4">
			<p class="text-xs font-bold text-muted-foreground">{i + 1}. {stage.label}</p>
			<h2 id="{stage.id}-heading" class="mt-1 text-xl font-bold tracking-tight">{stage.title}</h2>

			<div class="mt-8 grid gap-14">
				{#each stage.features as f (f.title)}
					<!-- 広い画面は左に文・右にキャプチャ。スマホは文を先に、キャプチャを下に。 -->
					<article class="grid items-start gap-5 sm:grid-cols-2 sm:gap-10">
						<div class="sm:pt-2">
							<h3 class="text-base font-bold">{f.title}</h3>
							{#each f.body as p (p)}
								<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{p}</p>
							{/each}
						</div>
						<img
							src={f.shot.src}
							width={f.shot.size.width}
							height={f.shot.size.height}
							alt={f.shot.alt}
							loading="lazy"
							decoding="async"
							class="h-auto w-full max-w-sm justify-self-center rounded-xl border"
						/>
					</article>
				{/each}
			</div>
		</section>
	{/each}

	<section class="mt-16 border-t pt-8">
		<h2 class="text-xl font-bold tracking-tight">メモは自分だけのもの</h2>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			書いたメモは既定で非公開で、書いた本人しか読めません。人に見せたいメモや予想だけ、共有リンクを発行して渡せます。共有したものは検索には出ず、いつでも共有をやめられます。
		</p>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			レースと出走馬は運営者がまとめて登録します（JRA の重賞が中心です）。使うのに必要なのは Google
			アカウントだけで、料金はかかりません。
		</p>
		<div class="mt-6 max-w-md">
			<GoogleLogin />
		</div>
	</section>

	<p class="mt-8 text-xs text-muted-foreground">
		画面の例に出てくる馬・レース・メモはすべて架空のものです。
	</p>

	<footer class="mt-4 flex gap-4 border-t pt-4 text-xs text-muted-foreground">
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
