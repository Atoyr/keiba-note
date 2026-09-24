<script lang="ts">
	import { courseMap, type CourseMapSource } from '$lib/utils/course';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	/**
	 * レースを走るコースの図と、回り・直線・高低差。
	 *
	 * 図は `src/lib/assets/courses/` の SVG を `<img>` で読む。`?no-inline` を付けて、
	 * 小さなファイルでも JS に埋め込ませず、`/_app/immutable/assets/` に名前にハッシュの付いた
	 * ファイルとして出させる。そこには adapter が1年のキャッシュを付けるので、
	 * 一度読んだ図は次からブラウザと Cloudflare のエッジから返る。
	 *
	 * スマホでは畳んでおき、見出しの行に寸法だけを出す。図は見返すための資料で、
	 * 開くたびに書く欄が1画面ぶん下がるのは困るため。広い画面では開いたまま出す。
	 * 畳むのは `<details>` なので JS が無くても開ける。スマホ用と広い画面用を両方描いて
	 * CSS でどちらかを隠す（`<details>` を幅で開け閉めするには JS が要り、読み込みの前後で形が変わる）。
	 */
	let { race, class: className = '' }: { race: CourseMapSource; class?: string } = $props();

	// ファイル名（`tokyo-turf.svg`）→ URL。
	const urls = Object.fromEntries(
		Object.entries(
			import.meta.glob<string>('$lib/assets/courses/*.svg', {
				eager: true,
				query: '?no-inline',
				import: 'default'
			})
		).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url])
	);

	const map = $derived(courseMap(race));
	const src = $derived(map ? urls[`${map.file}.svg`] : undefined);
</script>

{#snippet figure(src: string, m: NonNullable<typeof map>)}
	<!-- 置かれた枠の幅で並べ方を変える。全幅なら寸法を図の横に、半分の幅なら図の下に置く。
	     寸法は1項目ずつ折り返す（「高低差 内回り / 3.1m」のように途中で切れると読めない）。 -->
	<div class="@container mt-1">
		<figure class="@md:flex @md:items-center @md:gap-6">
			<!-- lazy: スマホで畳んだまま（display: none）なら読まない。 -->
			<img
				{src}
				alt={m.alt}
				width={m.width}
				height={m.height}
				loading="lazy"
				class="mx-auto h-auto max-w-full @md:mx-0"
			/>
			<figcaption class="mt-1 @md:mt-0">
				<ul class="flex flex-wrap gap-x-3 text-xs text-muted-foreground @md:flex-col @md:gap-1">
					{#each m.facts as fact (fact)}
						<li class="whitespace-nowrap">{fact}</li>
					{/each}
				</ul>
			</figcaption>
		</figure>
	</div>
{/snippet}

{#if map && src}
	<div class={className}>
		<details class="group rounded-lg border px-3 py-2 sm:hidden">
			<summary
				class="flex min-h-6 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
			>
				<span class="text-xs font-semibold text-muted-foreground">コース</span>
				<!-- 畳んでいる間だけ寸法を出す。開けば図の下に同じものが出る。 -->
				<span class="min-w-0 flex-1 truncate text-xs text-muted-foreground group-open:invisible">
					{map.facts.join(' · ')}
				</span>
				<ChevronDown
					class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
					aria-hidden="true"
				/>
			</summary>
			{@render figure(src, map)}
		</details>

		<section class="hidden h-full rounded-lg border px-3 py-2 sm:block" aria-label="コース">
			<h2 class="text-xs font-semibold text-muted-foreground">コース</h2>
			{@render figure(src, map)}
		</section>
	</div>
{/if}
