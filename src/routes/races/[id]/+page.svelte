<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	// 下書きの置き場。レースとユーザーで分ける（同じ端末を2人で使う場合に混ざらないように）。
	let formEl = $state<HTMLFormElement | null>(null);
	let keeper = $state<DraftKeeper | null>(null);
	const draftKey = $derived(`k-note:draft:review:${page.data.user?.id ?? '-'}:${data.race.id}`);

	const header = $derived(
		[data.race.date, `${data.race.course}${data.race.raceNumber ?? ''}R`, data.race.name ?? '']
			.filter(Boolean)
			.join('  ')
	);

	const spec = $derived(
		[
			// 重賞は見出しの格の札で分かるが、条件戦は条件がレースの識別子になる。
			data.race.grade ? '' : (data.race.className ?? ''),
			data.race.surface && data.race.distance
				? `${data.race.surface}${data.race.distance}m`
				: (data.race.surface ?? ''),
			data.race.direction ?? '',
			data.race.trackCondition ?? '',
			data.race.weather ?? ''
		].filter(Boolean)
	);

	const ta =
		'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-gray-900 focus:outline-none';
</script>

<svelte:head><title>{data.race.name ?? data.race.course} — k-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<div class="flex flex-wrap items-baseline gap-2">
		<h1 class="text-xl font-bold tracking-tight">{header}</h1>
		{#if data.race.grade}
			<GradeBadge grade={data.race.grade} />
		{/if}
	</div>
	<p class="mt-1 text-sm text-gray-600">{spec.join(' / ')}</p>
	<div class="mt-1 flex flex-wrap gap-4 text-sm">
		<a
			href={resolve('/races/[id]/preview', { id: data.race.id })}
			class="text-gray-600 hover:underline"
		>
			予想（過去メモを見る）
		</a>
		{#if admin}
			<a
				href={resolve('/races/[id]/entries', { id: data.race.id })}
				class="text-gray-600 hover:underline"
			>
				出走馬を編集
			</a>
		{/if}
	</div>

	{#if form && 'message' in form && form.message}
		<p
			class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if form && 'saved' in form}
		{#key form.savedAt}
			<p
				class="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
			>
				保存しました（{form.saved} 件）
			</p>
		{/key}
	{/if}

	{#if data.rows.length === 0}
		<p class="mt-8 rounded-md border border-gray-200 p-4 text-sm text-gray-500">
			出走馬がまだ登録されていません。
			{#if admin}
				<a href={resolve('/races/[id]/entries', { id: data.race.id })} class="underline">
					出走馬を入力する
				</a>
			{/if}
		</p>
	{/if}

	<!-- 1画面・1送信でレース1本分のふりかえりが完結する（design.md 第6章）。 -->
	<form
		method="POST"
		bind:this={formEl}
		use:enhance={() =>
			async ({ result, update }) => {
				// 保存が通ったときだけ下書きを捨てる。失敗したら残す
				// （電波が悪くて落ちた場合、書いたものを失わないため）。
				if (result.type === 'success') keeper?.clear();
				// **reset: false が必須。** 既定の update() はフォームを reset() するが、
				// Svelte はテキストエリアを .value で更新するので defaultValue は空のまま。
				// リセットすると全欄が空になり、そのあとの再描画では値が変わっていない
				// メモが「変化なし」と判断されて描き直されない。
				// 結果、保存した直後に中身が消えたように見える。
				// このフォームは「空欄＝そのメモを消す」仕様なので、そこでもう一度
				// 保存すると本当に消える。表示はサーバーの data が正で、
				// フォームの初期値ではない。
				await update({ reset: false });
			}}
		class="mt-8"
	>
		<DraftKeeper bind:this={keeper} form={formEl} storageKey={draftKey} />
		<section>
			<h2 class="text-sm font-semibold text-gray-500">レースのメモ</h2>
			<p class="text-xs text-gray-500">ペース、馬場、展開など「レースの性質」</p>
			<textarea name="raceNoteBody" rows="3" placeholder="前半緩くて上がり勝負。内有利。" class={ta}
				>{data.myRaceNote?.body ?? ''}</textarea
			>
		</section>

		{#if data.rows.length > 0}
			<section class="mt-8">
				<h2 class="text-sm font-semibold text-gray-500">出走馬</h2>
				<p class="text-xs text-gray-500">
					本文も札も空のままにするとメモは保存されません（既存メモは消えます）
				</p>

				<ul class="mt-2 space-y-5">
					{#each data.rows as r (r.entryId)}
						<li class="border-t border-gray-200 pt-3">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
								{#if r.finishPosition}
									<span class="font-bold">{r.finishPosition}着</span>
								{/if}
								{#if r.horseNumber}
									<span class="text-gray-500">{r.horseNumber}</span>
								{/if}
								<a
									href={resolve('/horses/[id]', { id: r.horseId })}
									class="font-medium hover:underline"
								>
									{r.horseName}
								</a>
								{#if r.jockey}<span class="text-gray-600">{r.jockey}</span>{/if}
								{#if r.finishTime}<span class="font-mono text-xs text-gray-500">{r.finishTime}</span
									>{/if}
								{#if r.margin}<span class="text-xs text-gray-500">{r.margin}</span>{/if}
								{#if r.last3f}<span class="text-xs text-gray-500">上り{r.last3f}</span>{/if}
							</div>

							<textarea
								name="body.{r.entryId}"
								rows="2"
								placeholder="直線で外に出してから一完歩が速い。"
								class={ta}>{r.myNote?.body ?? ''}</textarea
							>

							<div class="mt-1.5">
								<TagPicker name="tags.{r.entryId}" values={r.myNote?.tags ?? []} />
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<div class="sticky bottom-0 mt-8 border-t border-gray-200 bg-white/90 py-3 backdrop-blur">
			<button
				type="submit"
				class="w-full rounded-md bg-gray-900 px-4 py-2.5 font-medium text-white hover:bg-gray-700"
			>
				まとめて保存
			</button>
		</div>
	</form>
</main>
