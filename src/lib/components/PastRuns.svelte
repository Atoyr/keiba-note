<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import type { PastRun } from '$lib/server/services/races';

	/**
	 * 馬柱（簡略版）。1走を1行で出す。
	 *
	 * 競馬新聞のフル馬柱は斤量・馬体重・通過順・タイムまで載せるが、
	 * この画面は**競馬場で片手で読む**ことを前提にしている（design.md 第8章 Phase 4）。
	 * 横スクロールが要る密度にすると、その場で使えなくなる。
	 *
	 * 出すのは「いつ・何で・どう走ったか」に絞る:
	 *   日付 / レース名(格) / 馬場・距離・状態 / 着順 / 人気 / 上がり3F
	 *
	 * 着順が入っていない行も落とさずに出す。出馬表だけ登録して結果がまだ
	 * 入っていないレースは実際にあるので、「走ったが結果は未入力」と
	 * 「走っていない」を混同させない。
	 */
	let { runs }: { runs: PastRun[] } = $props();

	/** `2026-09-06` → `09/06`。年は同じ並びの中では冗長なので落とす。 */
	const md = (d: string) => d.slice(5).replace('-', '/');

	/** `芝2000良` のような1かたまり。欠けている要素は詰める。 */
	const cond = (r: PastRun) =>
		[r.surface, r.distance ? `${r.distance}m` : null, r.trackCondition].filter(Boolean).join('');

	/** 掲示板（5着以内）を少し強める。拾い読みで着順だけ追えるように。 */
	const tone = (p: number | null) =>
		p === null
			? 'text-muted-foreground'
			: p === 1
				? 'font-bold text-red-700'
				: p <= 5
					? 'font-medium'
					: '';
</script>

{#if runs.length === 0}
	<p class="text-xs text-muted-foreground">過去走の記録がありません。</p>
{:else}
	<ol class="divide-y divide-border/60 text-xs">
		{#each runs as r (r.raceId)}
			<li class="flex flex-wrap items-baseline gap-x-2 py-1">
				<span class="font-mono text-muted-foreground">{md(r.date)}</span>
				<span class="truncate">{r.raceName ?? `${r.course}${r.raceNumber ?? ''}R`}</span>
				<GradeBadge grade={r.grade} />
				<!-- 重賞は格の札で足りるが、**条件戦は条件そのものがレースの識別子**。
				     格が無いときだけクラスを出す（両方出すと重複して見える）。 -->
				{#if !r.grade && r.className}
					<span class="rounded bg-muted px-1 text-[10px] text-muted-foreground">
						{r.className}
					</span>
				{/if}
				<span class="font-mono text-muted-foreground">{cond(r)}</span>
				<!-- 着順・人気・上がりは1つのまとまりにする。バラで並べると、
				     狭い画面で折り返したときに3つが別々の行に散る。 -->
				<span class="ms-auto flex shrink-0 items-baseline gap-x-2">
					<span class={tone(r.finishPosition)}>
						{r.finishPosition ? `${r.finishPosition}着` : '—'}
					</span>
					{#if r.popularity}<span class="text-muted-foreground">{r.popularity}人気</span>{/if}
					{#if r.last3f}
						<span class="font-mono text-muted-foreground">上{r.last3f.toFixed(1)}</span>
					{/if}
				</span>
			</li>
		{/each}
	</ol>
{/if}
