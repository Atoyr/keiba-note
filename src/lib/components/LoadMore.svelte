<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * 一覧の下端。近づいたら続きを読み、押しても読める（読んだ行を足すのは `PagedList`）。
	 *
	 * - 下端の 600px 手前で読み始める（IntersectionObserver）。読み終えても下端がまだ近ければ続けて読む
	 * - **ボタンは JS が無いときのリンクを兼ねる。** `href` は `?offset=` を付けた次のページで、
	 *   JS があれば移らずにその場で足す。キーボードで読む人と、自動で読めなかったときの入口にもなる
	 * - 読めなければ自動では読み直さない。文を出して「もう一度読み込む」を押してもらう
	 *   （通信が切れたまま下端で読み直しを繰り返さないため）
	 */
	let {
		href,
		load,
		shown,
		unit
	}: {
		/** 次のページの URL。`null` なら続きは無く、何も出さない。 */
		href: string | null;
		/** 続きを読んで足す。読めなければ投げる。 */
		load: () => Promise<void>;
		/** いま出している行の数。読み終えたことを読み上げで伝えるのに使う。 */
		shown: number;
		/** 数える単位（`件`・`頭`）。 */
		unit: string;
	} = $props();

	let status = $state<'idle' | 'loading' | 'error'>('idle');
	let sentinel = $state<HTMLElement>();
	let announce = $state('');

	async function more() {
		if (status === 'loading') return;
		status = 'loading';
		try {
			await load();
			await tick();
			status = 'idle';
			announce = `${shown} ${unit}まで表示しています`;
		} catch {
			status = 'error';
		}
	}

	function onclick(event: MouseEvent) {
		// 修飾キー付き・中ボタンは、ブラウザに任せて次のページを別タブで開かせる。
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		void more();
	}

	// IntersectionObserver はブラウザの API なので $effect で張る（frontend.md 第3章）。
	// 読み終えると href が替わって張り直され、下端がまだ近ければすぐにまた読む。
	$effect(() => {
		if (!sentinel || href === null || status !== 'idle') return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void more();
			},
			{ rootMargin: '0px 0px 600px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

{#if href !== null}
	<div bind:this={sentinel} class="mt-6 flex flex-col items-center gap-2">
		{#if status === 'error'}
			<p role="alert" class="text-sm text-destructive">
				続きを読み込めませんでした。通信を確かめて、もう一度読み込んでください。
			</p>
		{/if}
		<Button {href} variant="outline" size="lg" aria-disabled={status === 'loading'} {onclick}>
			{#if status === 'loading'}
				読み込んでいます…
			{:else if status === 'error'}
				もう一度読み込む
			{:else}
				続きを読み込む
			{/if}
		</Button>
	</div>
{/if}
<p class="sr-only" aria-live="polite">{announce}</p>
