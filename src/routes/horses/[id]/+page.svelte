<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import LockIcon from '$lib/components/LockIcon.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let profileOpen = $state(false);

	const profile = $derived(
		[
			data.horse.sex,
			data.horse.birthYear ? `${new Date().getFullYear() - data.horse.birthYear}歳` : null,
			data.horse.sire ? `父${data.horse.sire}` : null,
			data.horse.trainer
		].filter(Boolean)
	);

	/** レース紐付きのメモには見出しを出す。近況メモは「（近況メモ）」。 */
	function heading(n: (typeof data.timeline)[number]): string {
		if (n.kind === 'horse') return '（近況メモ）';
		const parts = [
			n.course ? `${n.course}${n.raceNumber ?? ''}R` : null,
			n.raceName,
			n.grade ? `(${n.grade})` : null,
			n.finishPosition ? `${n.finishPosition}着` : null
		].filter(Boolean);
		return parts.join(' ') || '（レース）';
	}

	const input = 'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
</script>

<svelte:head><title>{data.horse.name} — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">{data.horse.name}</h1>
	{#if profile.length > 0}
		<p class="mt-1 text-sm text-gray-600">{profile.join(' / ')}</p>
	{/if}

	{#if data.horse.profileMemo}
		<p
			class="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap"
		>
			{data.horse.profileMemo}
		</p>
	{/if}

	<button
		type="button"
		onclick={() => (profileOpen = !profileOpen)}
		class="mt-2 text-sm text-gray-600 hover:underline"
	>
		{profileOpen ? '閉じる' : 'プロフィールを編集'}
	</button>

	{#if profileOpen}
		<form
			method="POST"
			action="?/saveProfile"
			use:enhance
			class="mt-3 grid grid-cols-2 gap-3 rounded-md border border-gray-200 p-4"
		>
			<label class="text-sm">
				<span class="font-medium">性別</span>
				<select name="sex" class={input}>
					<option value="">—</option>
					{#each ['牡', '牝', 'セ'] as s (s)}
						<option value={s} selected={data.horse.sex === s}>{s}</option>
					{/each}
				</select>
			</label>
			<label class="text-sm">
				<span class="font-medium">生年</span>
				<input type="number" name="birthYear" value={data.horse.birthYear ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">調教師</span>
				<input name="trainer" value={data.horse.trainer ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">カナ</span>
				<input name="nameKana" value={data.horse.nameKana ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">父</span>
				<input name="sire" value={data.horse.sire ?? ''} class={input} />
			</label>
			<label class="text-sm">
				<span class="font-medium">母</span>
				<input name="dam" value={data.horse.dam ?? ''} class={input} />
			</label>
			<label class="col-span-2 text-sm">
				<span class="font-medium">プロフィールメモ</span>
				<textarea name="profileMemo" rows="2" class={input}>{data.horse.profileMemo ?? ''}</textarea
				>
			</label>
			<div class="col-span-2">
				<button
					type="submit"
					class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
				>
					保存
				</button>
			</div>
		</form>
	{/if}

	{#if form && 'message' in form && form.message}
		<p
			class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<section class="mt-8">
		<h2 class="text-sm font-semibold text-gray-500">タイムライン</h2>

		<details class="mt-2 rounded-md border border-gray-200 p-3">
			<summary class="cursor-pointer text-sm text-gray-700">＋ 近況メモを追加</summary>
			<form method="POST" action="?/addNote" use:enhance class="mt-3">
				<textarea
					name="body"
					rows="3"
					required
					placeholder="北海道滞在。追い切りの動き良いとのこと。"
					class={input}></textarea>
				<div class="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
					<label class="flex items-center gap-1.5">
						日付
						<input
							type="date"
							name="occurredAt"
							value={data.today}
							class="rounded border border-gray-300 px-2 py-1"
						/>
					</label>
					<label class="flex items-center gap-1.5">
						期待度
						<select name="rating" class="rounded border border-gray-300 px-1.5 py-1">
							<option value="">—</option>
							{#each [1, 2, 3, 4, 5] as n (n)}<option value={n}>{'★'.repeat(n)}</option>{/each}
						</select>
					</label>
					<label class="flex items-center gap-1.5">
						<input type="checkbox" name="visibility" value="private" />
						<LockIcon />非公開
					</label>
					<button
						type="submit"
						class="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700"
					>
						追加
					</button>
				</div>
			</form>
		</details>

		{#if data.timeline.length === 0}
			<p class="mt-4 text-sm text-gray-500">まだメモがありません。</p>
		{:else}
			<ol class="mt-4 space-y-5">
				{#each data.timeline as n (n.id)}
					<li class="border-l-2 border-gray-200 pl-4">
						<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
							<span class="font-mono text-gray-500">{n.occurredAt}</span>
							{#if n.raceId}
								<a href={resolve('/races/[id]', { id: n.raceId })} class="hover:underline">
									{heading(n)}
								</a>
							{:else}
								<span class="text-gray-500">{heading(n)}</span>
							{/if}
							{#if n.visibility === 'private'}
								<span
									class="inline-flex items-center gap-1 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700"
								>
									<LockIcon />非公開
								</span>
							{/if}
						</div>

						<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>

						<div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
							<span>{n.authorName}</span>
							{#if n.rating}<span>{'★'.repeat(n.rating)}</span>{/if}
							{#if n.authorId === data.viewerId && n.kind === 'horse'}
								<form method="POST" action="?/deleteNote" use:enhance>
									<input type="hidden" name="noteId" value={n.id} />
									<button type="submit" class="text-red-700 hover:underline">削除</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</main>
