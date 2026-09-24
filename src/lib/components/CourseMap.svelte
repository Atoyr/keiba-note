<script lang="ts">
	import { courseMap, type CourseMapSource } from '$lib/utils/course';

	/**
	 * レースを走るコースの図と、回り・直線・高低差。
	 *
	 * 図は `src/lib/assets/courses/` の SVG を `<img>` で読む。`?no-inline` を付けて、
	 * 小さなファイルでも JS に埋め込ませず、`/_app/immutable/assets/` に名前にハッシュの付いた
	 * ファイルとして出させる。そこには adapter が1年のキャッシュを付けるので、
	 * 一度読んだ図は次からブラウザと Cloudflare のエッジから返る。
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

{#if map && src}
	<!-- 図の幅は場の大きさで変わる。広い画面では寸法を図の横に置き、枠が空かないようにする。
	     寸法は1項目ずつ折り返す（「高低差 内回り / 3.1m」のように途中で切れると読めない）。 -->
	<figure class="rounded-lg border px-3 py-2 sm:flex sm:items-center sm:gap-6 {className}">
		<img
			{src}
			alt={map.alt}
			width={map.width}
			height={map.height}
			class="mx-auto h-auto max-w-full sm:mx-0"
		/>
		<figcaption class="mt-1 sm:mt-0">
			<ul class="flex flex-wrap gap-x-3 text-xs text-muted-foreground sm:flex-col sm:gap-1">
				{#each map.facts as fact (fact)}
					<li class="whitespace-nowrap">{fact}</li>
				{/each}
			</ul>
		</figcaption>
	</figure>
{/if}
