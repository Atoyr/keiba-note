<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	// $lib/server/services/races の PastRun は server 側の型なので引かない（architecture.md 第2章）。
	// 要るのは表示に使うものだけなので構造だけ受ける。サーバーの PastRun はこの形を満たすので、
	// ずれたら preview ページの `<PastRuns runs={...} />` で svelte-check が落ちる。
	type PastRun = {
		raceId: string;
		date: string;
		course: string;
		raceNumber: number | null;
		raceName: string | null;
		grade: string | null;
		className: string | null;
		surface: string | null;
		distance: number | null;
		trackCondition: string | null;
		finishPosition: number | null;
		popularity: number | null;
		last3f: number | null;
		finishTime: string | null;
		passing: string | null;
	};

	/**
	 * 馬柱（簡略版）。1走を1行で出す。
	 *
	 * 競馬新聞のフル馬柱は斤量・馬体重・通過順・タイムまで載せるが、
	 * この画面は**競馬場で片手で読む**ことを前提にしている（product.md 第8章 Phase 4）。
	 * 横スクロールが要る密度にすると、その場で使えなくなる。
	 *
	 * 1行目は「いつ・何で・どう走ったか」に絞る:
	 *   日付 / レース名(格) / 馬場・距離・状態 / 着順 / 人気 / 上がり3F
	 *
	 * タイムと通過順は2行目に、着順のまとまりの下へ右寄せで、薄い色で足す。
	 * 1行目に足すと狭い画面で折り返しが増え、着順の位置が行ごとにずれて
	 * 縦に拾い読みできなくなる。2行目なら1行目の並びは今までと変わらない。
	 * どちらも無い走（結果が未入力）は2行目ごと出さない。
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
				<!-- 格の札は一覧の行ではレース名の前（product.md 第6章）。
				     重賞は格の札で足りるが、**条件戦は条件そのものがレースの識別子**。
				     格が無いときだけクラスを札と同じ位置に出す（両方出すと重複して見える）。 -->
				<GradeBadge grade={r.grade} />
				{#if !r.grade && r.className}
					<span class="rounded bg-muted px-1 text-[10px] text-muted-foreground">
						{r.className}
					</span>
				{/if}
				<span class="truncate">{r.raceName ?? `${r.course}${r.raceNumber ?? ''}R`}</span>
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
				{#if r.finishTime || r.passing}
					<!-- basis-full で必ず次の行に送る。見出しの語は画面には出さない
					     （`1:58.4` と `5-5-4-2` は形で見分けが付く）が、読み上げでは要る。 -->
					<span class="flex basis-full justify-end gap-x-2 font-mono text-muted-foreground">
						{#if r.finishTime}
							<span><span class="sr-only">タイム</span>{r.finishTime}</span>
						{/if}
						{#if r.passing}
							<span><span class="sr-only">通過順</span>{r.passing}</span>
						{/if}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
