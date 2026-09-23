<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import NoteMenu from '$lib/components/NoteMenu.svelte';
	import ShareControl from '$lib/components/ShareControl.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { isUpcoming } from '$lib/utils/date';
	import { noteHeading, runHeading } from '$lib/utils/note';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	let profileOpen = $state(false);

	const profile = $derived(
		[
			data.horse.sex,
			data.horse.birthYear ? `${new Date().getFullYear() - data.horse.birthYear}歳` : null,
			data.horse.sire ? `父${data.horse.sire}` : null,
			data.horse.trainer
		].filter(Boolean)
	);

	const input = 'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
</script>

<svelte:head><title>{data.horse.name} — uma-memo</title></svelte:head>

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

	<!-- プロフィールは全ユーザー共通のマスタなので、書き換えられるのは admin だけ
	     （product.md 第4章）。一般ユーザーにはタイムラインの近況メモだけを残す。 -->
	{#if admin}
		<button
			type="button"
			onclick={() => (profileOpen = !profileOpen)}
			class="mt-2 text-sm text-gray-600 hover:underline"
		>
			{profileOpen ? '閉じる' : 'プロフィールを編集'}
		</button>
	{/if}

	{#if admin && profileOpen}
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
					class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/80"
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
				<div class="mt-2">
					<TagPicker name="tags" />
				</div>
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
					<button
						type="submit"
						class="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/80"
					>
						追加
					</button>
				</div>
			</form>
		</details>

		{#if data.timeline.length === 0}
			<p class="mt-4 text-sm text-gray-500">まだメモも出走もありません。</p>
		{:else}
			<!-- 未来 → 過去。次走が先頭、古い走りほど下に沈む（mergeHorseTimeline）。 -->
			<ol class="mt-4 space-y-5">
				{#each data.timeline as row (row.key)}
					{#if row.type === 'run'}
						{@const h = runHeading(row.run, row.upcoming)}
						<!-- メモの無い出走。走った事実だけの行なので、実線ではなく破線で
						     「ここには何も書いていない」ことを見せる。 -->
						<li class="border-l-2 border-dashed border-gray-300 pl-4">
							<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
								<span class="font-mono text-gray-500">{row.occurredAt}</span>
								<KindBadge label={h.kindLabel} />
								<!-- 出走予定のレースはふりかえりが書けない。予想画面へ送る。 -->
								<a
									href={row.upcoming
										? resolve('/races/[id]/preview', { id: row.run.raceId })
										: resolve('/races/[id]', { id: row.run.raceId })}
									class="text-gray-600 hover:underline"
								>
									{h.label}
								</a>
							</div>
						</li>
					{:else}
						{@const n = row.note}
						{@const h = noteHeading(n)}
						<li class="border-l-2 border-gray-200 pl-4">
							<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
								<span class="font-mono text-gray-500">{n.occurredAt}</span>
								<KindBadge label={h.kindLabel} />
								{#if n.raceId}
									<!-- レース紐付きのメモは occurred_at がレース日なので、それで振り分けられる。 -->
									<a
										href={isUpcoming(n.occurredAt, data.today)
											? resolve('/races/[id]/preview', { id: n.raceId })
											: resolve('/races/[id]', { id: n.raceId })}
										class="hover:underline"
									>
										{h.label}
									</a>
								{:else}
									<span class="text-gray-500">{h.label}</span>
								{/if}
								<SharedBadge visibility={n.visibility} />
								<!-- 共有と削除は読み返すあいだには使わない操作なので畳む。
								     削除が出しっぱなしだと押し間違いの的にもなる。 -->
								<div class="ms-auto self-center">
									<NoteMenu>
										<ShareControl
											noteId={n.id}
											visibility={n.visibility}
											redirectTo="/horses/{data.horse.id}"
										/>
										{#if n.kind === 'horse'}
											<form
												method="POST"
												action="?/deleteNote"
												use:enhance
												class="mt-2 border-t pt-2"
											>
												<input type="hidden" name="noteId" value={n.id} />
												<button type="submit" class="text-xs text-red-700 hover:underline">
													この近況メモを削除
												</button>
											</form>
										{/if}
									</NoteMenu>
								</div>
							</div>

							{#if n.body}
								<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
							{/if}

							<TagBadges tags={n.tags} class="mt-1" />
						</li>
					{/if}
				{/each}
			</ol>
		{/if}
	</section>
</main>
