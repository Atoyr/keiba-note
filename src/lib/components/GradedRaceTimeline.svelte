<script lang="ts">
	import { resolve } from '$app/paths';
	import HorseNumberBadge from '$lib/components/HorseNumberBadge.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import type { NoteTag, PredictionMark } from '$lib/schemas/note';
	import { opensReview } from '$lib/utils/date';

	/**
	 * 重賞の年ごとのメモ（その年のレースの下に、見立て・ペース・印・ふりかえり・勝ち馬を重ねたもの）。
	 * 重賞の画面（`/graded-races/[name]`）の「年ごとのメモ」と、予想・ふりかえり画面のレース情報タブの
	 * 「重賞のタイムライン」で同じ形に出す。見出しと空の案内は呼び出し側に置く。
	 * 1頭ごとのメモの本文は出さない（年数 × 頭数で読めなくなる）。件数だけ出して、読むときはレースを開く。
	 *
	 * 型は構造的に書く（画面側はサーバーのコードを型ですら import しない。architecture.md 第2章）。
	 * load が `buildGradedRaceTimeline` で組んだ値をそのまま渡す。
	 */
	let {
		timeline,
		today
	}: {
		timeline: {
			year: string;
			races: {
				race: {
					id: string;
					date: string;
					course: string;
					raceNumber: number | null;
					name: string | null;
					surface: string | null;
					distance: number | null;
					trackCondition: string | null;
					winnerName: string | null;
					resultCount: number;
				};
				/** まだ日が来ていないレース。 */
				upcoming: boolean;
				preview: { body: string; pace: string | null } | null;
				review: { body: string; tags: NoteTag[] } | null;
				entryNoteCount: number;
				marks: {
					entryId: string;
					mark: PredictionMark;
					horseName: string;
					bracket: number | null;
					horseNumber: number | null;
					finishPosition: number | null;
				}[];
			}[];
		}[];
		/** 今日（`YYYY-MM-DD`）。行の行き先（ふりかえりか予想画面か）を決める。 */
		today: string;
	} = $props();
</script>

{#each timeline as y (y.year)}
	<div class="mt-4">
		<h3 class="text-sm font-semibold">{y.year}年</h3>
		<ol class="mt-2 space-y-4">
			{#each y.races as row (row.race.id)}
				{@const r = row.race}
				{@const empty =
					!row.preview && !row.review && row.marks.length === 0 && row.entryNoteCount === 0}
				<!-- 結果が出たか、レース全体のふりかえりを書いたレースはふりかえりへ。それ以外は予想画面へ送る。 -->
				{@const raceHref = opensReview(
					{ date: r.date, resultCount: r.resultCount },
					today,
					!!row.review
				)
					? resolve('/races/[id]', { id: r.id })
					: resolve('/races/[id]/preview', { id: r.id })}
				{@const spec = [
					r.surface && r.distance
						? `${r.surface}${r.distance}m${r.trackCondition ? `・${r.trackCondition}` : ''}`
						: null,
					r.winnerName ? `勝ち馬 ${r.winnerName}` : null
				]
					.filter(Boolean)
					.join('・')}
				<!-- メモの無い年は、騎手のタイムラインと同じく破線で「何も書いていない」ことを見せる。 -->
				<li class="border-l-2 pl-4 {empty ? 'border-dashed' : 'border-border'}">
					<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
						<span class="font-mono text-muted-foreground">{r.date}</span>
						<KindBadge label={row.upcoming ? '開催予定' : null} />
						<a href={raceHref} class="hover:underline {empty ? 'text-muted-foreground' : ''}">
							{r.course}{r.raceNumber ?? ''}R {r.name ?? 'レース'}
						</a>
					</div>
					{#if spec}
						<div class="mt-1 text-sm text-muted-foreground">{spec}</div>
					{/if}

					{#if row.preview || row.marks.length > 0}
						<!-- 予想は薄い面に載せ、走ったあとのメモと見分ける（騎手画面の出走前メモと同じ）。 -->
						<div class="mt-2 rounded-md border border-sky-200 bg-sky-50/60 px-2.5 py-1.5 text-sm">
							<div class="flex items-center gap-2">
								<KindBadge label="予想" />
								{#if row.preview?.pace}
									<span class="text-xs text-muted-foreground">ペース {row.preview.pace}</span>
								{/if}
							</div>
							{#if row.preview?.body}
								<p class="mt-1 leading-relaxed whitespace-pre-wrap">{row.preview.body}</p>
							{/if}
							{#if row.marks.length > 0}
								<ul class="mt-1 space-y-1">
									{#each row.marks as m (m.entryId)}
										<li class="flex flex-wrap items-center gap-x-2 gap-y-1">
											<MarkBadge mark={m.mark} />
											<HorseNumberBadge bracket={m.bracket} horseNumber={m.horseNumber} />
											<span class="font-medium">{m.horseName}</span>
											{#if !row.upcoming && m.finishPosition}
												<span class="text-muted-foreground">{m.finishPosition}着</span>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}

					{#if row.review}
						<div class="mt-2 text-sm">
							<KindBadge label="ふりかえり" />
							{#if row.review.body}
								<p class="mt-1 leading-relaxed whitespace-pre-wrap">{row.review.body}</p>
							{/if}
							<TagBadges tags={row.review.tags} class="mt-1" />
						</div>
					{/if}

					{#if row.entryNoteCount > 0}
						<!-- 1頭ごとのメモの本文は出さない（読むときはレースを開く）。件数だけ出して、あることを見せる。 -->
						<p class="mt-2 text-sm">
							<a href={raceHref} class="text-muted-foreground hover:underline">
								1頭ごとのメモ {row.entryNoteCount}件
							</a>
						</p>
					{/if}

					{#if empty}
						<p class="mt-1 text-sm text-muted-foreground">メモはありません</p>
					{/if}
				</li>
			{/each}
		</ol>
	</div>
{/each}
