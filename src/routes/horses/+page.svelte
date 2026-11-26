<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import FavoriteStar from '#lib/components/FavoriteStar.svelte';
	import LoadMore from '#lib/components/LoadMore.svelte';
	import { PagedList } from '#lib/components/paged-list.svelte.ts';
	import { actionHref, pageHref } from '#lib/utils/paging.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// 100頭ずつ。下端に近づいたら次の100頭を足す（→ PagedList / LoadMore）。
	const horses = new PagedList(
		() => ({ url: page.url, page: data.horses }),
		(next) => next.horses as typeof data.horses
	);
	export const snapshot = horses.snapshot;

	let listEl = $state<HTMLElement>();
	let favoriteCheck = $state<HTMLInputElement>();
	/** 解除を送っている行（二重送信を止める）。 */
	let pendingId = $state<string | null>(null);
	/** 通信・サーバーの失敗で外せなかった行（JS 有りのとき）。 */
	let failedId = $state<string | null>(null);

	const failMessage = '推しから外せませんでした。もう一度星のボタンを押してください';
	/** 失敗の文を出す行。JS 有りの失敗か、JS 無しで返ってきた失敗。 */
	const failedRow = $derived(
		failedId ?? (form && 'message' in form && form.horseId ? form.horseId : null)
	);

	/** 解除のあとにフォーカスを移す先を、送信前に決める（行が消えて body に落ちないように）。 */
	function focusTarget(id: string): () => HTMLElement | null | undefined {
		const items = horses.items;
		const i = items.findIndex((h) => h.id === id);
		const neighbour = items[i + 1] ?? items[i - 1];
		return () =>
			neighbour
				? listEl?.querySelector<HTMLElement>(`[data-star="${neighbour.id}"] button`)
				: favoriteCheck;
	}
</script>

<svelte:head><title>馬 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">馬</h1>
	<p class="mt-1 text-sm text-gray-600">
		馬は出走馬の入力で自動的に登録されます。名前で絞り込めます。
	</p>

	<form
		method="GET"
		action={resolve('/horses')}
		class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2"
	>
		<input
			name="q"
			value={data.q}
			placeholder="馬名で検索"
			aria-label="馬名"
			class="w-full min-w-0 rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-auto sm:flex-1"
		/>
		<label class="flex items-center gap-2 text-sm">
			<input
				bind:this={favoriteCheck}
				type="checkbox"
				name="favorite"
				value="1"
				checked={data.favoriteOnly}
				class="size-4"
			/>
			推し馬のみ
		</label>
		<button
			type="submit"
			class="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
		>
			検索
		</button>
	</form>

	<!-- JS が無いとトーストは出ないので、外せたことを画面にも出す（frontend.md 第3章）。 -->
	{#if form && 'unfavorited' in form}<noscript
			><p class="mt-4 text-sm">推しから外しました。</p></noscript
		>{/if}
	<!-- どの行の失敗か分からない失敗（horseId が空など）は、一覧の上に出す。 -->
	{#if form && 'message' in form && !form.horseId}
		<p class="mt-4 text-sm text-destructive" role="alert">{form.message}</p>
	{/if}

	{#if data.horses.items.length === 0 && data.offset === 0}
		{#if data.favoriteOnly && !data.q}
			<p class="mt-8 text-sm text-muted-foreground">
				推しの馬はまだいません。馬の画面で星のボタンを押すと、ここに並びます。
			</p>
			<p class="mt-2 text-sm">
				<a href={resolve('/horses')} class="underline">すべての馬を見る</a>
			</p>
		{:else if data.favoriteOnly}
			<p class="mt-8 text-sm text-muted-foreground">見つかりませんでした。</p>
			<p class="mt-2 text-sm">
				<a href="{resolve('/horses')}?favorite=1" class="underline">検索条件を外す</a>
			</p>
		{:else}
			<p class="mt-8 text-sm text-gray-500">
				{data.q
					? '見つかりませんでした。'
					: 'まだ馬がいません。レースに出走馬を入力すると増えます。'}
			</p>
		{/if}
	{:else}
		{#if data.offset > 0}
			<!-- JS が無いときは「続きを読み込む」で offset 付きのページへ移るので、先頭へ戻る道を置く。 -->
			<p class="mt-6 text-xs text-muted-foreground">
				{data.offset + 1} 頭目から
				<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは今開いている URL のまま、offset を外しているだけ（frontend.md 第3章） -->
				<a href={pageHref(page.url, 0)} class="underline">先頭から見る</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</p>
		{/if}
		<ul bind:this={listEl} class="mt-6 divide-y divide-gray-200 border-y border-gray-200">
			{#each horses.items as h (h.id)}
				<li>
					<div class="flex items-center gap-2">
						<a
							href={resolve('/horses/[id]', { id: h.id })}
							class="block min-w-0 flex-1 py-3 hover:bg-gray-50"
						>
							<div class="flex flex-wrap items-baseline gap-x-2">
								<span class="font-medium break-words">{h.name}</span>
								{#if h.sex}<span class="text-xs text-gray-500">{h.sex}</span>{/if}
								{#if h.trainer}<span class="text-xs text-gray-500">{h.trainer}</span>{/if}
							</div>
							<div class="mt-0.5 text-xs text-gray-500">
								出走 {h.entryCount} 戦 ・メモ {h.noteCount} 件
							</div>
						</a>
						{#if data.favoriteOnly}
							<!-- 推し馬のみのときだけ、行から外せる（推しにするのは馬の画面）。
							     action は今のクエリを残す。JS が無いとき、送信後の画面も絞り込みのまま。 -->
							<form
								method="POST"
								action={actionHref(page.url, 'unfavorite')}
								data-star={h.id}
								class="shrink-0"
								use:enhance={({ cancel }) => {
									if (pendingId !== null) {
										cancel();
										return;
									}
									pendingId = h.id;
									failedId = null;
									const target = focusTarget(h.id);
									return async ({ result, update }) => {
										try {
											if (result.type === 'success') {
												horses.remove(h.id);
												await update({ reset: false });
												toast.success(`${h.name}を推しから外しました`);
												await tick();
												target()?.focus();
											} else if (result.type === 'redirect') {
												await update();
											} else {
												// 行は残し、もう一度押せるようにする（update() はエラー画面に移るので呼ばない）。
												failedId = h.id;
											}
										} catch {
											failedId = h.id;
										} finally {
											pendingId = null;
										}
									};
								}}
							>
								<input type="hidden" name="horseId" value={h.id} />
								<FavoriteStar favorite={true} pending={pendingId === h.id} horseName={h.name} />
							</form>
						{/if}
					</div>
					{#if failedRow === h.id}
						<p class="pb-2 text-xs text-destructive" role="alert">{failMessage}</p>
					{/if}
				</li>
			{/each}
		</ul>
		<LoadMore
			href={horses.href}
			load={() => horses.loadNext()}
			list={listEl}
			shown={data.offset + horses.items.length}
			unit="頭"
		/>
	{/if}
</main>
