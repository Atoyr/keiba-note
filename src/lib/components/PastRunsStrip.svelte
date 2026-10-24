<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { cond, finish, title, tone, ymd, type PastRun } from '$lib/utils/past-runs';

	/**
	 * 馬柱の帯（新聞型の横並び）。直近5走を1走1マスで、前走 → 5走前の順に横へ並べる。
	 * 縦の表（`PastRuns`）と違い、行を開かずに16頭の近走を見比べるためのもの（PC・タブレットだけ。pages.md 4-2）。
	 *
	 * **リンクは置かない。** 16頭 × 5走で Tab の止まり場所が80増える。騎手・重賞への導線は詳細情報の表にある。
	 * 1〜4走の馬は空のマスで5マスまで埋め、どの馬でも前走が同じ列に来るようにする。
	 * 欠けた値は詰める（推測しない）。
	 */
	let { runs, horseName }: { runs: PastRun[]; horseName: string } = $props();

	const SLOTS = 5;
	const shown = $derived(runs.slice(0, SLOTS));
	const blanks = $derived(Math.max(0, SLOTS - shown.length));
</script>

{#if runs.length === 0}
	<p class="text-xs text-muted-foreground">過去走の記録がありません。</p>
{:else}
	<ol aria-label="{horseName}の馬柱（直近5走）" class="grid grid-cols-5 gap-1.5">
		{#each shown as r (r.raceId)}
			<li class="flex min-w-0 flex-col gap-0.5 rounded-md border p-1.5 text-xs">
				<p class="flex min-w-0 items-baseline gap-x-1">
					<span class="shrink-0 font-mono text-muted-foreground">{ymd(r.date)}</span>
					<span class="truncate text-muted-foreground">{r.course}</span>
				</p>
				{#if r.grade || r.className}
					<p class="flex min-w-0 items-center gap-x-1">
						<GradeBadge grade={r.grade} />
						{#if !r.grade && r.className}
							<span class="shrink-0 rounded bg-muted px-1 text-xs text-foreground">
								{r.className}
							</span>
						{/if}
					</p>
				{/if}
				<!-- 1マスは 110px ほどなので、レース名は別の段にして2行まで折り返す。それでも切れる分は title（マウス）と詳細情報の表で読める。 -->
				<p class="line-clamp-2 break-words" title={title(r)}>{title(r)}</p>
				{#if cond(r)}
					<p class="truncate font-mono text-muted-foreground">{cond(r)}</p>
				{/if}
				<p class="flex items-baseline gap-x-1.5">
					<span class="text-sm whitespace-nowrap {tone(r.finishPosition)}">
						<span class="sr-only">着順</span>{finish(r)}
					</span>
					{#if r.popularity}
						<span class="whitespace-nowrap text-muted-foreground">{r.popularity}人</span>
					{/if}
				</p>
				{#if r.last3f || r.passing}
					<p class="flex flex-wrap gap-x-1.5 text-muted-foreground">
						{#if r.last3f}
							<span class="font-mono whitespace-nowrap tabular-nums"
								><span class="sr-only">上り</span>{r.last3f.toFixed(1)}</span
							>
						{/if}
						{#if r.passing}
							<span class="font-mono whitespace-nowrap"
								><span class="sr-only">通過</span>{r.passing}</span
							>
						{/if}
					</p>
				{/if}
				{#if r.jockey}
					<p class="truncate text-muted-foreground"><span class="sr-only">騎手</span>{r.jockey}</p>
				{/if}
			</li>
		{/each}
		{#each Array.from({ length: blanks }, (_, i) => i) as i (i)}
			<li aria-hidden="true" class="rounded-md border border-dashed"></li>
		{/each}
	</ol>
{/if}
