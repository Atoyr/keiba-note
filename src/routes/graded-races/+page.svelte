<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { formatDateShort } from '$lib/utils/date';
	import { gradedRaceParam } from '$lib/utils/graded-race';
	import { conditionLabel } from '$lib/utils/note';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** 月ごとの見出しの下に並べる（日付の昇順で来るので、続く同じ月をまとめるだけ）。 */
	const months = $derived.by(() => {
		const groups: { month: number; items: typeof data.items }[] = [];
		for (const item of data.items) {
			const month = Number(item.date.slice(5, 7));
			const last = groups.at(-1);
			if (last && last.month === month) last.items.push(item);
			else groups.push({ month, items: [item] });
		}
		return groups;
	});
</script>

<svelte:head><title>重賞 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">重賞</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		今年（{data.year}年）の重賞。格は今年のもの。年をまたいで、予想とふりかえりのメモを並べて見られます。
	</p>

	{#if data.items.length === 0}
		<p class="mt-8 text-sm text-muted-foreground">今年の重賞はまだ登録されていません。</p>
	{:else}
		{#each months as g (g.month)}
			<section class="mt-6" aria-labelledby="month-{g.month}">
				<h2 id="month-{g.month}" class="text-sm font-semibold text-muted-foreground">
					{g.month}月
				</h2>
				<ul class="mt-2 divide-y border-y">
					{#each g.items as item (item.key)}
						<li>
							<a
								href={resolve('/graded-races/[name]', { name: gradedRaceParam(item.key) })}
								class="flex items-center gap-2 py-3 hover:bg-muted"
							>
								<!-- 折り返すのは左（日付・格・名前・条件）の中だけ。右の印は行ごとに同じ位置に置く。 -->
								<span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
									<span class="font-mono text-sm text-muted-foreground">
										{formatDateShort(item.date)}
									</span>
									<GradeBadge grade={item.grade} />
									<span class="font-medium">{item.name}</span>
									<span class="text-xs text-muted-foreground"
										>{conditionLabel(item) ?? item.course}</span
									>
								</span>
								{#if item.hasTrend || item.notedYears > 0}
									<span class="flex shrink-0 items-center gap-2">
										{#if item.hasTrend}
											<Badge variant="outline" class="font-normal text-muted-foreground">傾向</Badge
											>
										{/if}
										{#if item.notedYears > 0}
											<span class="text-xs text-muted-foreground">メモ {item.notedYears}年</span>
										{/if}
									</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</main>
