<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import GradedRaceTimeline from '$lib/components/GradedRaceTimeline.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { formatDateShort } from '$lib/utils/date';
	import { conditionLabel } from '$lib/utils/note';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * JS が無いと失敗の画面は描き直されるので、失敗したときは開いたまま始める（失敗のメッセージと入力が見える）。
	 * 見るのは最初の描画の `form` だけ（JS があるときの失敗は、開いた欄の中でそのまま出る）。
	 */
	const startOpen = untrack(() => !!form?.message);
	/**
	 * 傾向の入力欄が開いているか。保存が通ったら閉じる（書いたものが読む形で出る）。
	 * 正は `<details>` の `open` で、これはその写し。`bind:open` にしないのは、hydration が
	 * この状態の値（閉）を要素に書き込み、JS が届く前に開いた欄が閉じてしまうため（NoteMenu.svelte と同じ）。
	 */
	let editing = $state(startOpen);
	let pending = $state(false);
	let toggle = $state<HTMLElement>();
	let details: HTMLDetailsElement;

	// hydration の前に開かれていたら、ここで拾う。
	onMount(() => {
		editing = details.open;
	});

	function sync() {
		editing = details.open;
	}

	const hasTrend = $derived(!!data.trend);
	const head = $derived(data.headline);
</script>

<svelte:head><title>{data.name} — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">{data.name}</h1>
	<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
		<GradeBadge grade={head.grade} />
		{#if head.isThisYear}
			<span>格は{head.year}年のもの</span>
			<span>{formatDateShort(head.race.date)} {conditionLabel(head.race) ?? head.race.course}</span>
		{:else if head.thisYearNotGraded}
			<span>{head.year}年の格（今年は重賞ではありません）</span>
		{:else}
			<span>{head.year}年の格（今年のレースは未登録）</span>
		{/if}
	</div>

	<section class="mt-6" aria-labelledby="graded-trend">
		<h2 id="graded-trend" class="text-sm font-semibold text-muted-foreground">傾向</h2>

		<!-- 書いた傾向は畳まない。畳むのは書く側だけ（騎手のまとめと同じ）。
		     `<details>` なので JS が無くても開ける。傾向の文は `<summary>` の外に置く
		     （中に入れると、開閉のボタンの読み上げ名が全文になる）。 -->
		<div class="mt-2 rounded-md border p-3">
			{#if !editing}
				{#if data.trend}
					<!-- 本文の改行は whitespace-pre-wrap で保つ（要素の前後の空白は Svelte が落とす）。 -->
					<p class="text-sm leading-relaxed whitespace-pre-wrap">
						{data.trend.body}
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						まだ傾向のメモはありません。年をまたいで気づいたこと（枠・脚質・前走の傾向）を残せます。
					</p>
				{/if}
			{/if}
			{#snippet editor()}
				<summary
					bind:this={toggle}
					class="mt-1 inline-flex min-h-6 cursor-pointer list-none items-center text-xs text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
				>
					<span class="group-open:hidden">{hasTrend ? '書き直す' : '＋ 傾向を書く'}</span>
					<span class="hidden group-open:inline">閉じる</span>
				</summary>

				<form
					method="POST"
					action="?/saveTrend"
					class="mt-2 grid gap-3"
					use:enhance={({ cancel }) => {
						if (pending) {
							cancel();
							return;
						}
						pending = true;
						return async ({ result, update }) => {
							try {
								// 表示の正はサーバーの data。フォームを初期値に戻すと、描き直されない欄が空に見える
								// （frontend.md 第3章「update({ reset: false })」）。
								await update({ reset: false });
								if (result.type === 'success') {
									// toggle イベントは後から来るので、editing もここで揃える。
									details.open = false;
									editing = false;
									// 押した保存ボタンは閉じた中に消えるので、フォーカスを開閉のボタンへ戻す。
									await tick();
									toggle?.focus();
									toast.success(
										result.data?.trend === 'cleared' ? '傾向を消しました' : '傾向を保存しました'
									);
								}
							} finally {
								pending = false;
							}
						};
					}}
				>
					<Textarea
						name="body"
						rows={4}
						aria-label="傾向の本文"
						placeholder="内枠の先行馬が残る年が多い。前走で負けた馬の巻き返しに注意。"
						class="text-sm"
						value={form?.body ?? data.trend?.body ?? ''}
					/>
					<p class="text-xs text-muted-foreground">空にして保存すると、傾向のメモは消えます。</p>
					<div class="flex flex-wrap items-center gap-3">
						<Button type="submit" aria-disabled={pending} class="aria-disabled:opacity-50">
							傾向を保存する
						</Button>
						{#if form?.message}
							<p class="text-sm text-destructive" role="alert">{form.message}</p>
						{/if}
					</div>
				</form>
			{/snippet}
			<!-- `open={startOpen}` とは書かない。式の `open` は hydration が要素に書き込み、JS が届く前に
			     開いた欄が閉じてしまう。直に書いた属性は hydration で触られないので、属性の有無で2つに分ける。 -->
			{#if startOpen}
				<details class="group" open bind:this={details} ontoggle={sync}>
					{@render editor()}
				</details>
			{:else}
				<details class="group" bind:this={details} ontoggle={sync}>
					{@render editor()}
				</details>
			{/if}
		</div>
		{#if form && 'trend' in form}<noscript
				><p class="mt-1 text-sm">
					{form.trend === 'cleared' ? '傾向を消しました。' : '傾向を保存しました。'}
				</p></noscript
			>{/if}
	</section>

	<section class="mt-8" aria-labelledby="graded-years">
		<h2 id="graded-years" class="text-sm font-semibold text-muted-foreground">年ごとのメモ</h2>
		{#if !data.hasNotes}
			<p class="mt-2 text-sm text-muted-foreground">
				予想画面とふりかえり画面で書いたレースのメモが、年ごとにここに並びます。
			</p>
		{/if}

		<GradedRaceTimeline timeline={data.timeline} today={data.today} />
	</section>
</main>
