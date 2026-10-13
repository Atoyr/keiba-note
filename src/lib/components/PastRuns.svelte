<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { resolve } from '$app/paths';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import type { NoteTag, Mark } from '$lib/schemas/note';

	/**
	 * 1走ぶん。サーバーの `listPastRuns` の戻り値と同じ形だが、**型は import せずここで持つ**
	 * （画面側はサーバーのコードを型ですら import しない。architecture.md 第2章）。
	 * 渡す側（予想画面の PageData）との食い違いは svelte-check が見る。
	 */
	type PastRun = {
		entryId?: string;
		notes?: { id: string; kind: string; body: string; tags: NoteTag[]; mark: Mark | null }[];
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
		fieldSize: number | null;
		winnerName: string | null;
		runnerUpName: string | null;
		/** 勝ち馬とのタイム差（秒）。勝った走は2着との差が負で入る。 */
		timeDiff: number | null;
		bracket: number | null;
		horseNumber: number | null;
		finishPosition: number | null;
		popularity: number | null;
		last3f: number | null;
		finishTime: string | null;
		passing: string | null;
		jockey: string | null;
	};

	/**
	 * 馬柱（簡略版）。1走を表の1行（と補足の1行）で出す。
	 *
	 * 競馬新聞のフル馬柱は斤量・馬体重・通過順・タイムまで載せるが、
	 * この画面は**競馬場で片手で読む**ことを前提にしている（pages.md 4-2）。
	 * 表の幅は画面に収まる密度に絞り、ページ全体を横に動かさない
	 * （320px のように狭い幅だけ、表を入れた箱の中で横に動く）。
	 *
	 * 列は「日付・レース / 着順 / 枠番 / 通過 / 上り / 人気」。列を縦にそろえて、
	 * 着順や上りを5走ぶん縦に拾い読みできるようにする。
	 * 日付・レースの列だけが残りの幅を取り、レース名は切る（truncate）。
	 *
	 * 各走の2段目は薄い色の補足。「誰が乗ったか」（騎手）と
	 * 「誰にどれだけ負けたか」（勝ち馬とタイム差。勝った走は2着馬と、2着につけた差を負で）、
	 * 右に走破タイム。どれも無い走は2段目ごと出さない。
	 *
	 * 自分のメモは表の下に別のかたまりで出す（メモは長さがまちまちで、表の行に混ぜると列がそろわない）。
	 *
	 * 着順が入っていない行も落とさずに出す。出馬表だけ登録して結果がまだ
	 * 入っていないレースは実際にあるので、「走ったが結果は未入力」と
	 * 「走っていない」を混同させない。
	 */
	let { runs }: { runs: PastRun[] } = $props();

	/**
	 * `2026-09-06` → `26/09/06`。年は2桁で残す。休み明けで5走が年をまたぐと、
	 * 月日だけでは前走からの間隔も、何年前の走りかも読めない。
	 */
	const ymd = (d: string) => d.slice(2).replaceAll('-', '/');

	/** `3-5`（枠-馬番）。片方だけなら単位を付けて `3枠` / `5番`（裸の数字だと枠と読まれる）。どちらも無ければ `—`。 */
	const post = (r: PastRun) =>
		r.bracket && r.horseNumber
			? `${r.bracket}-${r.horseNumber}`
			: r.bracket
				? `${r.bracket}枠`
				: r.horseNumber
					? `${r.horseNumber}番`
					: '—';

	/** `3/16`（着順/頭数）。頭数が無ければ `3着`。着順が無くても頭数があれば `—/16`、どちらも無ければ `—`。頭数は取得元の値。 */
	const finish = (r: PastRun) =>
		r.finishPosition === null
			? r.fieldSize
				? `—/${r.fieldSize}`
				: '—'
			: r.fieldSize
				? `${r.finishPosition}/${r.fieldSize}`
				: `${r.finishPosition}着`;

	/** レース名。付いていなければ `中山11R`。 */
	const title = (r: PastRun) => r.raceName ?? `${r.course}${r.raceNumber ?? ''}R`;

	/** メモのある走。runs は新しい順なので、そのまま新しい順になる。 */
	const withNotes = $derived(runs.filter((r) => r.notes && r.notes.length > 0));

	/**
	 * 比べる相手。負けた走は勝ち馬、勝った走は2着馬（新聞の馬柱と同じ）。
	 * タイム差は取得元の表記のまま（勝った走は `-0.2` と負になる）。
	 */
	const rival = (r: PastRun) => {
		// 着順の無い走（取消・中止・結果が未入力）は、負けたのでも勝ったのでもない。勝ち馬を出すと負けたように読める。
		if (r.finishPosition === null) return null;
		const won = r.finishPosition === 1;
		const name = won ? r.runnerUpName : r.winnerName;
		const diff = r.timeDiff === null ? '' : `（${r.timeDiff.toFixed(1)}）`;
		return name || diff ? { label: won ? '2着馬' : '勝ち馬', text: `${name ?? ''}${diff}` } : null;
	};

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
	<!-- 狭い幅（320px）でもページを横に動かさない。表だけがこの箱の中で動く。 -->
	<div class="overflow-x-auto">
		<table class="w-full text-xs">
			<thead class="bg-muted text-foreground">
				<tr>
					<th scope="col" class="px-1.5 py-1.5 text-left font-normal">日付・レース</th>
					{#each ['着順', '枠番', '通過', '上り', '人気'] as head (head)}
						<th scope="col" class="px-1.5 py-1.5 text-right font-normal whitespace-nowrap"
							>{head}</th
						>
					{/each}
				</tr>
			</thead>
			<!-- 1走を1つの tbody にする（1段目が数字の列、2段目が補足）。 -->
			{#each runs as r (r.raceId)}
				{@const vs = rival(r)}
				<tbody class="border-t border-border/60">
					<tr>
						<!-- max-w-0 + w-full で、この列だけが残りの幅を取り、レース名が長くても表を広げない。 -->
						<td class="w-full max-w-0 px-1.5 pt-2 pb-1 align-middle">
							<div class="flex flex-wrap items-baseline gap-x-1.5">
								<span class="font-mono text-muted-foreground">{ymd(r.date)}</span>
								<!-- 格の札は一覧の行ではレース名の前（pages.md）。
								     重賞は格の札で足りるが、**条件戦は条件そのものがレースの識別子**。
								     格が無いときだけクラスを札と同じ位置に出す（両方出すと重複して見える）。 -->
								<GradeBadge grade={r.grade} />
								{#if !r.grade && r.className}
									<span class="rounded bg-muted px-1 text-[10px] text-muted-foreground">
										{r.className}
									</span>
								{/if}
							</div>
							<p class="truncate">{title(r)}</p>
							<p class="text-muted-foreground">
								{r.course}{r.raceNumber ?? ''}R
								<span class="font-mono whitespace-nowrap">{cond(r)}</span>
							</p>
						</td>
						<td
							class="px-1.5 pt-2 pb-1 text-right align-middle whitespace-nowrap {tone(
								r.finishPosition
							)}">{finish(r)}</td
						>
						<td class="px-1.5 pt-2 pb-1 text-right align-middle whitespace-nowrap">{post(r)}</td>
						<td class="px-1.5 pt-2 pb-1 text-right align-middle whitespace-nowrap tabular-nums"
							>{r.passing ?? '—'}</td
						>
						<td class="px-1.5 pt-2 pb-1 text-right align-middle whitespace-nowrap tabular-nums"
							>{r.last3f ? r.last3f.toFixed(1) : '—'}</td
						>
						<td class="px-1.5 pt-2 pb-1 text-right align-middle whitespace-nowrap"
							>{r.popularity ?? '—'}</td
						>
					</tr>
					{#if r.jockey || vs || r.finishTime}
						<tr>
							<!-- 見出しの語は画面には出さない（`1:58.4` は形で見分けが付き、騎手・勝ち馬は並びで分かる）が、読み上げでは要る。 -->
							<td colspan="6" class="px-1.5 pb-2 text-muted-foreground">
								<div class="flex flex-wrap gap-x-2">
									{#if r.jockey}
										<span><span class="sr-only">騎手</span>{r.jockey}</span>
									{/if}
									{#if vs}
										<span><span class="sr-only">{vs.label}</span>{vs.text}</span>
									{/if}
									{#if r.finishTime}
										<span class="ms-auto font-mono"
											><span class="sr-only">タイム</span>{r.finishTime}</span
										>
									{/if}
								</div>
							</td>
						</tr>
					{/if}
				</tbody>
			{/each}
		</table>
	</div>
	{#if withNotes.length > 0}
		<section class="mt-3">
			<h4 class="text-xs font-semibold">各レースの過去メモ（自分のメモ）</h4>
			<ol class="mt-2 grid gap-3 text-xs">
				{#each withNotes as r (r.raceId)}
					<li>
						<p class="flex flex-wrap items-baseline gap-x-2">
							<span class="font-mono text-muted-foreground">{ymd(r.date)}</span>
							<span class="min-w-0 text-muted-foreground">{title(r)}</span>
						</p>
						<div class="mt-1 grid gap-2 border-l-2 pl-3">
							{#each ['preview', 'entry'] as kind (kind)}
								{#each (r.notes ?? []).filter((note) => note.kind === kind) as note (note.id)}
									<div>
										<p class="flex items-center gap-1">
											<KindBadge label={kind === 'preview' ? '出走前' : 'ふりかえり'} /><MarkBadge
												mark={note.mark}
											/>
										</p>
										{#if note.body}<p class="mt-1 text-sm break-words whitespace-pre-wrap">
												{note.body}
											</p>{/if}
										<TagBadges tags={note.tags} class="mt-1" />
									</div>
								{/each}
							{/each}
							<a
								href={resolve('/races/[id]', { id: r.raceId })}
								class="inline-flex min-h-6 items-center underline"
								>この走りの画面でメモを確認・編集する</a
							>
						</div>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
{/if}
