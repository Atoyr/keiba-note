<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { formatDateShort, isSettled, opensReview } from '$lib/utils/date';
	import { isAdmin } from '$lib/utils/role';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	/** 日付ごとにまとめる。土日で2つの塊になるのが普通。連休は月曜・火曜も並ぶ。 */
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

<svelte:head><title>今週の重賞 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
		<h1 class="text-xl font-bold tracking-tight sm:text-2xl">今週の重賞</h1>
		<span class="text-sm text-muted-foreground">{weekLabel}</span>
	</div>
	<p class="mt-1 text-sm text-muted-foreground">JRA・芝の重賞のみ</p>

	<!-- 週送りは GET フォーム。?w= を安全に組み立てつつ JS 無効でも動く。 -->
	<nav class="mt-4 flex items-center gap-2">
		<form method="GET" action={resolve('/this-week')}>
			<input type="hidden" name="w" value={data.offset - 1} />
			<Button type="submit" variant="outline" size="sm">
				<ChevronLeft class="size-4" />
				前の週
			</Button>
		</form>
		{#if data.offset !== 0}
			<Button href={resolve('/this-week')} variant="ghost" size="sm">今週へ</Button>
		{/if}
		<span class="flex-1"></span>
		<form method="GET" action={resolve('/this-week')}>
			<input type="hidden" name="w" value={data.offset + 1} />
			<Button type="submit" variant="outline" size="sm">
				次の週
				<ChevronRight class="size-4" />
			</Button>
		</form>
	</nav>

	{#if byDate.length === 0}
		<Card.Root class="mt-6">
			<Card.Header>
				<Card.Title class="text-base">この週に JRA の芝重賞はありません</Card.Title>
				<Card.Description>
					{#if admin}
						レースを登録すると、条件に合うものがここに並びます。
					{:else}
						レースが登録されると、条件に合うものがここに並びます。
					{/if}
				</Card.Description>
			</Card.Header>
			{#if admin}
				<Card.Footer>
					<Button href={resolve('/races/new')} variant="outline" size="sm">レースを登録</Button>
				</Card.Footer>
			{/if}
		</Card.Root>
	{:else}
		{#each byDate as [date, races] (date)}
			<section class="mt-6">
				<h2 class="mb-2 text-sm font-medium text-muted-foreground">{formatDateShort(date)}</h2>
				<div class="grid gap-2">
					{#each races as r (r.id)}
						{@const settled = isSettled(r, data.today)}
						<!-- 結果が出たレース（とふりかえりを書いたレース）はふりかえりへ。
						     当日でも着順が入るまでは予想画面のまま。 -->
						<a
							href={opensReview(r, data.today, r.reviewCount > 0)
								? resolve('/races/[id]', { id: r.id })
								: resolve('/races/[id]/preview', { id: r.id })}
							class="block rounded-xl border p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40 sm:p-4"
						>
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
								<span class="font-mono text-sm text-muted-foreground">
									{r.course}{r.raceNumber ?? ''}R
								</span>
								<span class="font-medium">{r.name ?? '（レース名未設定）'}</span>
								<GradeBadge grade={r.grade} />
							</div>
							<div class="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
								<span>{r.surface ?? ''}{r.distance ? `${r.distance}m` : ''}</span>
								<span>出走 {r.entryCount} 頭</span>
								{#if settled}
									<span>結果あり</span>
								{/if}
								{#if r.noteCount > 0}
									<span class="text-foreground">メモ {r.noteCount} 件</span>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</main>
