<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { formatDateShort, isSettled } from '$lib/utils/date';
	import { conditionLabel } from '$lib/utils/note';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * 傾向の入力欄が開いているか。保存が通ったら閉じる（書いたものが読む形で出る）。
	 * JS が無いと失敗の画面は描き直されるので、失敗したときは開いたまま始める（失敗のメッセージと入力が見える）。
	 */
	let editing = $state(!!form?.message);
	let pending = $state(false);
	let toggle = $state<HTMLElement>();

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
			<details class="group" bind:open={editing}>
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
								// （product.md 第6章「update({ reset: false }) が要る」）。
								await update({ reset: false });
								if (result.type === 'success') {
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
			</details>
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

		{#each data.timeline as y (y.year)}
			<div class="mt-4">
				<h3 class="text-sm font-semibold">{y.year}年</h3>
				<ol class="mt-2 space-y-4">
					{#each y.races as row (row.race.id)}
						{@const r = row.race}
						{@const empty =
							!row.preview && !row.review && row.marks.length === 0 && row.entryNoteCount === 0}
						<!-- 結果が出たレースだけふりかえりへ。開催予定や結果の投入前は予想画面へ送る。 -->
						{@const raceHref = isSettled({ date: r.date, resultCount: r.resultCount }, data.today)
							? resolve('/races/[id]', { id: r.id })
							: resolve('/races/[id]/preview', { id: r.id })}
						{@const spec = [
							r.surface && r.distance
								? `${r.surface}${r.distance}m${r.trackCondition ? `・${r.trackCondition}` : ''}`
								: null,
							r.winnerName ? `勝ち馬 ${r.winnerName}` : null
						]
							.filter(Boolean)
							.join('・')}
						<!-- メモの無い年は、騎手のタイムラインと同じく破線で「何も書いていない」ことを見せる。 -->
						<li class="border-l-2 pl-4 {empty ? 'border-dashed' : 'border-border'}">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
								<span class="font-mono text-muted-foreground">{r.date}</span>
								<KindBadge label={row.upcoming ? '開催予定' : null} />
								<a href={raceHref} class="hover:underline {empty ? 'text-muted-foreground' : ''}">
									{r.course}{r.raceNumber ?? ''}R {r.name ?? 'レース'}
								</a>
							</div>
							{#if spec}
								<div class="mt-1 text-sm text-muted-foreground">{spec}</div>
							{/if}

							{#if row.preview || row.marks.length > 0}
								<!-- 予想は薄い面に載せ、走ったあとのメモと見分ける（騎手画面の出走前メモと同じ）。 -->
								<div
									class="mt-2 rounded-md border border-sky-200 bg-sky-50/60 px-2.5 py-1.5 text-sm"
								>
									<div class="flex items-center gap-2">
										<KindBadge label="予想" />
										{#if row.preview?.pace}
											<span class="text-xs text-muted-foreground">ペース {row.preview.pace}</span>
										{/if}
									</div>
									{#if row.preview?.body}
										<p class="mt-1 leading-relaxed whitespace-pre-wrap">{row.preview.body}</p>
									{/if}
									{#if row.marks.length > 0}
										<ul class="mt-1 space-y-1">
											{#each row.marks as m (m.entryId)}
												<li class="flex flex-wrap items-center gap-x-2 gap-y-1">
													<MarkBadge mark={m.mark} />
													<HorseNumberBadge bracket={m.bracket} horseNumber={m.horseNumber} />
													<span class="font-medium">{m.horseName}</span>
													{#if !row.upcoming && m.finishPosition}
														<span class="text-muted-foreground">{m.finishPosition}着</span>
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{/if}

							{#if row.review}
								<div class="mt-2 text-sm">
									<KindBadge label="ふりかえり" />
									{#if row.review.body}
										<p class="mt-1 leading-relaxed whitespace-pre-wrap">{row.review.body}</p>
									{/if}
									<TagBadges tags={row.review.tags} class="mt-1" />
								</div>
							{/if}

							{#if row.entryNoteCount > 0}
								<!-- 1頭ごとのメモの本文は出さない（読むときはレースを開く）。件数だけ出して、あることを見せる。 -->
								<p class="mt-2 text-sm">
									<a href={raceHref} class="text-muted-foreground hover:underline">
										1頭ごとのメモ {row.entryNoteCount}件
									</a>
								</p>
							{/if}

							{#if empty}
								<p class="mt-1 text-sm text-muted-foreground">メモはありません</p>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		{/each}
	</section>
</main>
