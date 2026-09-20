<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const header = $derived(
		[data.race.date, `${data.race.course}${data.race.raceNumber ?? ''}R`, data.race.name ?? '']
			.filter(Boolean)
			.join('  ')
	);

	const spec = $derived(
		[
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

<svelte:head><title>{data.race.name ?? data.race.course} — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<div class="flex flex-wrap items-baseline gap-2">
		<h1 class="text-xl font-bold tracking-tight">{header}</h1>
		{#if data.race.grade}
			<span class="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white">{data.race.grade}</span>
		{/if}
	</div>
	<p class="mt-1 text-sm text-gray-600">{spec.join(' / ')}</p>
	<a
		href={resolve('/races/[id]/entries', { id: data.race.id })}
		class="mt-1 inline-block text-sm text-gray-600 hover:underline"
	>
		出走馬を編集
	</a>

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
			<a href={resolve('/races/[id]/entries', { id: data.race.id })} class="underline">
				出走馬を入力する
			</a>
		</p>
	{/if}

	<!-- 1画面・1送信でレース1本分のふりかえりが完結する（design.md 第6章）。 -->
	<form method="POST" use:enhance class="mt-8">
		<section>
			<h2 class="text-sm font-semibold text-gray-500">レースのメモ</h2>
			<p class="text-xs text-gray-500">ペース、馬場、展開など「レースの性質」</p>
			<textarea name="raceNoteBody" rows="3" placeholder="前半緩くて上がり勝負。内有利。" class={ta}
				>{data.myRaceNote?.body ?? ''}</textarea
			>
			<label class="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
				<input
					type="checkbox"
					name="raceNoteVisibility"
					value="private"
					checked={data.myRaceNote?.visibility === 'private'}
				/>
				自分だけ
			</label>

			{#each data.othersRaceNotes as n (n.id)}
				<div class="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm">
					<p class="text-xs text-gray-500">{n.authorName}</p>
					<p class="mt-0.5 whitespace-pre-wrap">{n.body}</p>
				</div>
			{/each}
		</section>

		{#if data.rows.length > 0}
			<section class="mt-8">
				<h2 class="text-sm font-semibold text-gray-500">出走馬</h2>
				<p class="text-xs text-gray-500">
					空欄のままにするとメモは保存されません（既存メモは消えます）
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

							<div class="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-600">
								<label class="flex items-center gap-1.5">
									次走期待度
									<select
										name="rating.{r.entryId}"
										class="rounded border border-gray-300 px-1.5 py-0.5"
									>
										<option value="">—</option>
										{#each [1, 2, 3, 4, 5] as n (n)}
											<option value={n} selected={r.myNote?.rating === n}>
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
										checked={r.myNote?.visibility === 'private'}
									/>
									自分だけ
								</label>
							</div>

							{#each r.othersNotes as n (n.id)}
								<div class="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm">
									<p class="text-xs text-gray-500">
										{n.authorName}
										{#if n.rating}<span class="ml-1">{'★'.repeat(n.rating)}</span>{/if}
									</p>
									<p class="mt-0.5 whitespace-pre-wrap">{n.body}</p>
								</div>
							{/each}
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
