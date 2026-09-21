<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import LockIcon from '$lib/components/LockIcon.svelte';
	import NoteTag from '$lib/components/NoteTag.svelte';
	import { noteHeading } from '$lib/utils/note';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const spec = $derived(
		[
			data.race.surface && data.race.distance
				? `${data.race.surface}${data.race.distance}m`
				: (data.race.surface ?? ''),
			data.race.direction ?? '',
			`${data.rows.length}頭`
		].filter(Boolean)
	);

	/** 開いている馬。1頭ずつ開く。 */
	let open = $state<string | null>(null);
</script>

<svelte:head><title>{data.race.name ?? data.race.course} 予想 — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
	<a href={resolve('/this-week')} class="text-sm text-gray-600 hover:underline">← 今週の重賞</a>

	<div class="mt-2 flex flex-wrap items-baseline gap-2">
		<h1 class="text-lg font-bold tracking-tight sm:text-xl">
			{data.race.date}
			{data.race.course}{data.race.raceNumber ?? ''}R
			{data.race.name ?? ''}
		</h1>
		{#if data.race.grade}
			<span class="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white">{data.race.grade}</span>
		{/if}
	</div>
	<p class="mt-1 text-sm text-gray-600">{spec.join(' / ')}</p>

	<div class="mt-1 flex flex-wrap gap-4 text-sm">
		<a
			href={resolve('/races/[id]/entries', { id: data.race.id })}
			class="text-gray-600 hover:underline"
		>
			出走馬を編集
		</a>
		<a href={resolve('/races/[id]', { id: data.race.id })} class="text-gray-600 hover:underline">
			ふりかえりを書く
		</a>
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
				出走前メモを保存しました（{form.saved} 件）
			</p>
		{/key}
	{/if}

	{#if data.rows.length === 0}
		<p class="mt-8 rounded-md border border-gray-200 p-4 text-sm text-gray-500">
			出走馬がまだ登録されていません。
			<a href={resolve('/races/[id]/entries', { id: data.race.id })} class="underline">
				出走馬を入力する
			</a>
		</p>
	{:else}
		<form method="POST" use:enhance class="mt-6">
			<ul class="divide-y divide-gray-200 border-y border-gray-200">
				{#each data.rows as r (r.entryId)}
					<li class="py-3">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
							{#if r.bracket}
								<span
									class="inline-block w-5 rounded-sm bg-gray-100 text-center text-xs text-gray-700"
								>
									{r.bracket}
								</span>
							{/if}
							<span class="w-6 text-right font-mono text-sm text-gray-500">
								{r.horseNumber ?? '−'}
							</span>
							<a
								href={resolve('/horses/[id]', { id: r.horseId })}
								class="font-medium hover:underline"
							>
								{r.horseName}
							</a>
							{#if r.jockey}<span class="text-sm text-gray-600">{r.jockey}</span>{/if}
							<span class="flex-1"></span>
							{#if r.history.length > 0}
								<span class="text-xs text-gray-500">メモ {r.history.length}</span>
							{/if}
						</div>

						{#if r.history.length > 0}
							<ol class="mt-2 ml-8 space-y-2">
								{#each r.history.slice(0, open === r.entryId ? undefined : 2) as n (n.id)}
									{@const h = noteHeading(n)}
									<li class="border-l-2 border-gray-200 pl-3">
										<p class="flex flex-wrap items-center gap-x-1 text-xs text-gray-500">
											<span class="font-mono">{n.occurredAt}</span>
											<NoteTag tag={h.tag} />
											<span>{h.label}</span>
											{#if n.rating}<span class="ml-1">{'★'.repeat(n.rating)}</span>{/if}
											{#if n.visibility === 'private'}
												<LockIcon class="ml-1" />
											{/if}
										</p>
										<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
									</li>
								{/each}
							</ol>

							{#if r.history.length > 2}
								<button
									type="button"
									onclick={() => (open = open === r.entryId ? null : r.entryId)}
									class="mt-1 ml-8 text-xs text-gray-600 hover:underline"
								>
									{open === r.entryId ? '閉じる' : `もっと見る（残り ${r.history.length - 2} 件）`}
								</button>
							{/if}
						{:else}
							<p class="mt-1 ml-8 text-xs text-gray-400">メモなし</p>
						{/if}

						<details class="mt-2 ml-8" open={!!r.myPreview}>
							<summary class="cursor-pointer text-xs text-gray-600">
								{r.myPreview ? '出走前メモ' : '＋ 出走前メモ'}
							</summary>
							<textarea
								name="body.{r.entryId}"
								rows="2"
								placeholder="今回は内枠が向きそう。"
								class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-gray-900 focus:outline-none"
								>{r.myPreview?.body ?? ''}</textarea
							>
							<div class="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-600">
								<label class="flex items-center gap-1.5">
									期待度
									<select
										name="rating.{r.entryId}"
										class="rounded border border-gray-300 px-1.5 py-0.5"
									>
										<option value="">—</option>
										{#each [1, 2, 3, 4, 5] as n (n)}
											<option value={n} selected={r.myPreview?.rating === n}>
												{'★'.repeat(n)}
											</option>
										{/each}
									</select>
								</label>
								<label class="flex items-center gap-1.5">
									<input
										type="checkbox"
										name="visibility.{r.entryId}"
										value="private"
										checked={r.myPreview?.visibility === 'private'}
									/>
									<LockIcon />非公開
								</label>
							</div>

							{#each r.othersPreview as n (n.id)}
								<div class="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm">
									<p class="text-xs text-gray-500">
										{n.authorName}
										{#if n.rating}<span class="ml-1">{'★'.repeat(n.rating)}</span>{/if}
									</p>
									<p class="mt-0.5 whitespace-pre-wrap">{n.body}</p>
								</div>
							{/each}
						</details>
					</li>
				{/each}
			</ul>

			<div class="sticky bottom-0 mt-6 border-t border-gray-200 bg-white/90 py-3 backdrop-blur">
				<button
					type="submit"
					class="w-full rounded-md bg-gray-900 px-4 py-2.5 font-medium text-white hover:bg-gray-700"
				>
					出走前メモを保存
				</button>
			</div>
		</form>
	{/if}
</main>
