<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import JockeyTagBadges from '$lib/components/JockeyTagBadges.svelte';
	import JockeyTagPicker from '$lib/components/JockeyTagPicker.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { isSettled } from '$lib/utils/date';
	import { jockeyParam } from '$lib/utils/jockey';
	import { raceLabel } from '$lib/utils/note';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** まとめの入力欄が開いているか。保存が通ったら閉じる（書いたものが読む形で出る）。 */
	let editing = $state(false);
	let pending = $state(false);
	let toggle = $state<HTMLElement>();

	const hasSummary = $derived(!!data.summary);
	const self = $derived(resolve('/jockeys/[name]', { name: jockeyParam(data.name) }));
</script>

<svelte:head><title>{data.name} — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">{data.name}</h1>
	<!-- 入っている出走は、重賞の出走馬と気にしている馬の過去走だけ。騎手の全成績ではないので、
	     勝率のような数は出さない（偏った母数の率は、予想の材料として誤って読まれる）。 -->
	<p class="mt-1 text-sm text-muted-foreground">
		騎乗 {data.rideCount} 回（このアプリに入っている出走のうち）・メモのある騎乗 {data.notedCount} 回
	</p>

	<section class="mt-6" aria-labelledby="jockey-summary">
		<h2 id="jockey-summary" class="text-sm font-semibold text-muted-foreground">まとめ</h2>

		<!-- 書いたまとめは畳まない。畳むのは書く側だけ（予想画面の出走前メモと同じ）。
		     `<details>` なので JS が無くても開ける。
		     **まとめの文は `<summary>` の外に置く。** 中に入れると、開閉のボタンの読み上げ名がまとめ全文になる。
		     開いている間は下の入力欄が正なので、読む形は隠す（JS が無いときは出たまま）。 -->
		<div class="mt-2 rounded-md border p-3">
			{#if !editing}
				{#if data.summary}
					<!-- 改行を保つので、テンプレート側の字下げを入れないよう1行で書く。 -->
					{#if data.summary.body}<p class="text-sm leading-relaxed whitespace-pre-wrap">
							{data.summary.body}
						</p>{/if}
					<JockeyTagBadges tags={data.summary.tags} class="mt-1" />
				{:else}
					<p class="text-sm text-muted-foreground">
						まだまとめはありません。乗り方の癖や得意な場を、札と一言で残せます。
					</p>
				{/if}
			{/if}
			<details class="group" bind:open={editing}>
				<summary
					bind:this={toggle}
					class="mt-1 inline-flex min-h-6 cursor-pointer list-none items-center text-xs text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden"
				>
					<span class="group-open:hidden">{hasSummary ? '書き直す' : '＋ まとめを書く'}</span>
					<span class="hidden group-open:inline">閉じる</span>
				</summary>

				<form
					method="POST"
					action="?/saveSummary"
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
										result.data?.summary === 'cleared'
											? 'まとめを消しました'
											: 'まとめを保存しました'
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
						rows={3}
						aria-label="まとめの本文"
						placeholder="中山の内回りは前に行く。追ってからしぶとい。"
						class="text-sm"
						value={data.summary?.body ?? ''}
					/>
					<JockeyTagPicker name="tags" values={data.summary?.tags ?? []} />
					<p class="text-xs text-muted-foreground">
						本文も札も空にして保存すると、まとめは消えます。
					</p>
					<div class="flex flex-wrap items-center gap-3">
						<Button type="submit" aria-disabled={pending} class="aria-disabled:opacity-50">
							まとめを保存する
						</Button>
						{#if form?.message}
							<p class="text-sm text-destructive" role="alert">{form.message}</p>
						{/if}
					</div>
				</form>
			</details>
		</div>
		{#if form && 'summary' in form}<noscript
				><p class="mt-1 text-sm">
					{form.summary === 'cleared' ? 'まとめを消しました。' : 'まとめを保存しました。'}
				</p></noscript
			>{/if}
	</section>

	<section class="mt-8" aria-labelledby="jockey-rides">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 id="jockey-rides" class="text-sm font-semibold text-muted-foreground">騎乗</h2>
			<!-- 絞りは GET のリンク。JS が無くても切り替えられ、URL に残る。 -->
			<nav aria-label="騎乗の絞り込み" class="flex rounded-md border text-xs">
				<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは resolve() で組み、クエリを足しているだけ（frontend.md 第3章） -->
				{#each [{ noted: false, label: `すべて ${data.rideCount}` }, { noted: true, label: `メモのある騎乗 ${data.notedCount}` }] as opt (opt.label)}
					{@const active = data.onlyNoted === opt.noted}
					<a
						href={opt.noted ? `${self}?notes=1` : self}
						aria-current={active ? 'true' : undefined}
						class="flex h-8 items-center px-3 first:rounded-s-md last:rounded-e-md {active
							? 'bg-primary/10 font-medium text-foreground'
							: 'text-muted-foreground hover:bg-accent'}"
					>
						{opt.label}
					</a>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</nav>
		</div>

		{#if data.timeline.length === 0}
			<p class="mt-4 text-sm text-muted-foreground">
				この騎手の騎乗にはまだメモがありません。予想画面やふりかえり画面で書いた馬のメモが、ここに並びます。
			</p>
		{:else}
			<!-- 未来 → 過去。次の騎乗が先頭に来る（馬のタイムラインと同じ）。 -->
			<ol class="mt-4 space-y-4">
				{#each data.timeline as row (row.ride.entryId)}
					{@const r = row.ride}
					<!-- メモの無い騎乗は、馬のタイムラインと同じく破線で「何も書いていない」ことを見せる。 -->
					<li class="border-l-2 pl-4 {row.notes.length > 0 ? 'border-border' : 'border-dashed'}">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
							<span class="font-mono text-muted-foreground">{r.date}</span>
							<KindBadge label={row.upcoming ? '出走予定' : null} />
							<!-- 結果が出たレースだけふりかえりへ。出走予定や結果の投入前は予想画面へ送る。 -->
							<a
								href={isSettled({ date: r.date, resultCount: r.resultCount }, data.today)
									? resolve('/races/[id]', { id: r.raceId })
									: resolve('/races/[id]/preview', { id: r.raceId })}
								class="hover:underline {row.notes.length > 0 ? '' : 'text-muted-foreground'}"
							>
								{raceLabel(r) || 'レース'}
							</a>
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
							<span class="flex min-w-0 items-center gap-2">
								<HorseNumberBadge bracket={r.bracket} horseNumber={r.horseNumber} />
								<a
									href={resolve('/horses/[id]', { id: r.horseId })}
									class="min-w-0 font-medium hover:underline"
								>
									{r.horseName}
								</a>
							</span>
							{#if !row.upcoming && r.finishPosition}
								<span class="font-medium">{r.finishPosition}着</span>
							{/if}
							{#if r.popularity}
								<span class="text-muted-foreground">{r.popularity}人気</span>
							{/if}
						</div>

						{#each row.notes as n (n.id)}
							<!-- 出走前に書いたメモは薄い面に載せ、走ったあとのメモと見分ける（ふりかえり画面の「出走前」と同じ）。 -->
							<div
								class="mt-2 text-sm {n.kind === 'preview'
									? 'rounded-md border border-sky-200 bg-sky-50/60 px-2.5 py-1.5'
									: ''}"
							>
								{#if n.kind === 'preview'}
									<div class="flex items-center gap-2">
										<KindBadge label="出走前" />
										<MarkBadge mark={n.mark} />
									</div>
								{/if}
								{#if n.body}<p class="mt-1 leading-relaxed whitespace-pre-wrap">{n.body}</p>{/if}
								<TagBadges tags={n.tags} class="mt-1" />
							</div>
						{/each}
					</li>
				{/each}
			</ol>
		{/if}
		{#if data.shownLimit}
			<p class="mt-4 text-xs text-muted-foreground">
				新しい {data.shownLimit} 騎乗まで出しています（それより前の騎乗とメモは出していません）。
			</p>
		{/if}
	</section>
</main>
