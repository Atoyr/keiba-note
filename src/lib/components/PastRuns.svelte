<script lang="ts">
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { resolve } from '$app/paths';
	import JockeyLink from '$lib/components/JockeyLink.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import { gradedRaceKey, gradedRaceParam, isGraded } from '$lib/utils/graded-race';
	import { cond, finish, post, rival, title, tone, ymd, type PastRun } from '$lib/utils/past-runs';

	/**
	 * 馬柱（簡略版）。1走を表の3段（名前・数字・補足）で出す。
	 *
	 * 競馬新聞のフル馬柱は斤量・馬体重・通過順・タイムまで載せるが、
	 * この画面は**競馬場で片手で読む**ことを前提にしている（pages.md 4-2）。
	 * 表の幅は画面に収まる密度に絞り、ページ全体を横に動かさない
	 * （320px のように狭い幅だけ、表を入れた箱の中で横に動く）。
	 *
	 * 列は「日付・レース / 着順 / 枠番 / 通過 / 上り / 人気」。列を縦にそろえて、
	 * 着順や上りを5走ぶん縦に拾い読みできるようにする。
	 * 各走の1段目は名前の段。日付・格の札・レース名を、表の幅いっぱいを使って1行で、
	 * 折り返さず切らずに出す（「ラジオN杯京都2歳S」と「ラジオNIKKEI賞」のような
	 * 似た名前を見分けるため。#218）。折り返すと枠が広がって見にくい。
	 * 2段目は開催場・条件と数字の5列。
	 *
	 * 各走の3段目は薄い色の補足。「誰が乗ったか」（騎手）と
	 * 「誰にどれだけ負けたか」（勝ち馬とタイム差。勝った走は2着馬と、2着につけた差を負で）、
	 * 右に走破タイム。どれも無い走は3段目ごと出さない。
	 * 騎手名は騎手の画面へ、G1〜G3 のレース名は重賞の画面へのリンク（詳細情報からそこへ飛べる）。
	 *
	 * 自分のメモは表の下に別のかたまりで出す（メモは長さがまちまちで、表の行に混ぜると列がそろわない）。
	 *
	 * 着順が入っていない行も落とさずに出す。出馬表だけ登録して結果がまだ
	 * 入っていないレースは実際にあるので、「走ったが結果は未入力」と
	 * 「走っていない」を混同させない。
	 */
	let { runs }: { runs: PastRun[] } = $props();

	/** メモのある走。runs は新しい順なので、そのまま新しい順になる。 */
	const withNotes = $derived(runs.filter((r) => r.notes && r.notes.length > 0));
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
			<!-- 1走を1つの tbody にする（1段目が名前、2段目が数字の列、3段目が補足）。 -->
			{#each runs as r (r.raceId)}
				{@const vs = rival(r)}
				<tbody class="border-t border-border/60">
					<tr>
						<!-- 名前の段。6列ぶんの幅を使い、日付・格・レース名を1行で、折り返さず切らずに並べる。
						     6列すべての見出しの下に入る td にすると読み上げで「着順」などが名前に付くので、
						     1走（tbody）の見出しとして th scope="rowgroup" にする。 -->
						<th
							scope="rowgroup"
							colspan="6"
							class="px-1.5 pt-2 text-left font-normal whitespace-nowrap"
						>
							<div class="flex items-baseline gap-x-1.5">
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
								{#if isGraded(r.grade) && r.raceName}
									<!-- 押せる高さを 24px 取る（leading-6）。押せる範囲は文字の幅まで。 -->
									<a
										href={resolve('/graded-races/[name]', {
											name: gradedRaceParam(gradedRaceKey(r.raceName))
										})}
										class="leading-6 whitespace-nowrap underline underline-offset-2 hover:decoration-2"
										>{r.raceName}</a
									>
								{:else}
									<p class="whitespace-nowrap">{title(r)}</p>
								{/if}
							</div>
						</th>
					</tr>
					<tr>
						<!-- w-full で、この列が残りの幅を取り、数字の列を右に詰める。 -->
						<td class="w-full px-1.5 pb-1 align-middle text-muted-foreground">
							{r.course}{r.raceNumber ?? ''}R
							<span class="font-mono whitespace-nowrap">{cond(r)}</span>
						</td>
						<td
							class="px-1.5 pb-1 text-right align-middle whitespace-nowrap {tone(r.finishPosition)}"
							>{finish(r)}</td
						>
						<td class="px-1.5 pb-1 text-right align-middle whitespace-nowrap">{post(r)}</td>
						<td class="px-1.5 pb-1 text-right align-middle whitespace-nowrap tabular-nums"
							>{r.passing ?? '—'}</td
						>
						<td class="px-1.5 pb-1 text-right align-middle whitespace-nowrap tabular-nums"
							>{r.last3f ? r.last3f.toFixed(1) : '—'}</td
						>
						<td class="px-1.5 pb-1 text-right align-middle whitespace-nowrap"
							>{r.popularity ?? '—'}</td
						>
					</tr>
					{#if r.jockey || vs || r.finishTime}
						<tr>
							<!-- 見出しの語は画面には出さない（`1:58.4` は形で見分けが付き、騎手・勝ち馬は並びで分かる）が、読み上げでは要る。 -->
							<td colspan="6" class="px-1.5 pb-2 text-muted-foreground">
								<div class="flex flex-wrap gap-x-2">
									{#if r.jockey}
										<span
											><span class="sr-only">騎手</span><JockeyLink
												name={r.jockey}
												summary={null}
												class="inline-flex min-h-6 items-center underline decoration-dotted underline-offset-2 hover:decoration-solid"
											/></span
										>
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
