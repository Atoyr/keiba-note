<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateShort } from '$lib/utils/date';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** 日付ごとにまとめる。土日で2つの塊になるのが普通。 */
	const byDate = $derived(
		Object.entries(
			data.races.reduce<Record<string, typeof data.races>>((acc, r) => {
				(acc[r.date] ??= []).push(r);
				return acc;
			}, {})
		)
	);

	const weekLabel = $derived(
		`${formatDateShort(data.week.start)} 〜 ${formatDateShort(data.week.end)}`
	);
</script>

<svelte:head><title>今週の重賞 — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
	<h1 class="text-xl font-bold tracking-tight sm:text-2xl">今週の重賞</h1>
	<p class="mt-1 text-sm text-gray-600">JRA・芝の重賞のみ。{weekLabel}</p>

	<!-- 週送りは GET フォーム。?w= を安全に組み立てつつ JS 無効でも動く。 -->
	<nav class="mt-4 flex items-center gap-4 text-sm">
		<form method="GET" action={resolve('/this-week')}>
			<input type="hidden" name="w" value={data.offset - 1} />
			<button type="submit" class="text-gray-600 hover:underline">← 前の週</button>
		</form>
		{#if data.offset !== 0}
			<a href={resolve('/this-week')} class="text-gray-600 hover:underline">今週へ</a>
		{/if}
		<span class="flex-1"></span>
		<form method="GET" action={resolve('/this-week')}>
			<input type="hidden" name="w" value={data.offset + 1} />
			<button type="submit" class="text-gray-600 hover:underline">次の週 →</button>
		</form>
	</nav>

	{#if byDate.length === 0}
		<div class="mt-8 rounded-lg border border-gray-200 p-5">
			<p class="text-sm text-gray-600">この週に JRA の芝重賞はありません。</p>
			<p class="mt-2 text-sm text-gray-500">
				レースを登録すると、条件に合うものがここに並びます。
				<a href={resolve('/races/new')} class="underline">レースを登録</a>
			</p>
		</div>
	{:else}
		{#each byDate as [date, races] (date)}
			<section class="mt-8">
				<h2 class="text-sm font-semibold text-gray-500">{formatDateShort(date)}</h2>
				<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
					{#each races as r (r.id)}
						<li>
							<a
								href={resolve('/races/[id]/preview', { id: r.id })}
								class="block py-3 hover:bg-gray-50"
							>
								<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
									<span class="text-sm text-gray-500">{r.course}{r.raceNumber ?? ''}R</span>
									<span class="font-medium">{r.name ?? '（レース名未設定）'}</span>
									{#if r.grade}
										<span class="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-white">
											{r.grade}
										</span>
									{/if}
								</div>
								<div class="mt-0.5 text-xs text-gray-500">
									{r.surface ?? ''}{r.distance ? `${r.distance}m` : ''}
									・出走 {r.entryCount} 頭
									{#if r.noteCount > 0}
										<span class="ml-1 text-gray-700">・メモ {r.noteCount} 件</span>
									{/if}
								</div>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</main>
