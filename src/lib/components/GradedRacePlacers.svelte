<script lang="ts">
	import { resolve } from '$app/paths';
	import InfoTip from '#lib/components/InfoTip.svelte';
	import JockeyLink from '#lib/components/JockeyLink.svelte';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { conditionLabel } from '#lib/utils/note.ts';

	/**
	 * 重賞の過去の好走馬（重賞の画面の「傾向」の下の節）。窓の10年の1〜3着を、観点ごとの集計と年ごとの一覧で出す。
	 * 自分の傾向のメモとは別で、レースの結果から数えたもの。**率は出さない**（3着以内の馬だけを材料にした率は、
	 * 全出走馬に対する率ではないため）。出すのは勝ち馬の数と3着以内の頭数だけ。
	 * 前走はまだ出していない（当時の直前の出走を確かめられるデータが無い）ので、そのことを1行で言う。
	 *
	 * 型は構造的に書く（画面側はサーバーのコードを型ですら import しない。architecture.md 第2章）。
	 * load が `buildGradedRacePlacers` で組んだ値をそのまま渡す。
	 */
	type Aspect = {
		key: 'popularity' | 'jockey' | 'sire' | 'damSire';
		known: number;
		unknown: number;
		rows: {
			value: string;
			wins: number;
			placed: number;
			sources: { year: string; finishPosition: number }[];
		}[];
	};
	let {
		placers
	}: {
		placers: {
			fromYear: number;
			toYear: number;
			years: {
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
					};
					differs: boolean;
					complete: boolean;
					placers: {
						entryId: string;
						finishPosition: number;
						popularity: number | null;
						jockey: string | null;
						horseId: string;
						horseName: string;
						sire: string | null;
						damSire: string | null;
					}[];
				}[];
			}[];
			counts: {
				complete: number;
				partial: number;
				noResult: number;
				missingYears: string[];
				differs: number;
				placers: number;
				winners: number;
			};
			baseYear: string;
			aspects: Aspect[];
		};
	} = $props();

	const id = $props.id();

	const ASPECT_LABEL = { popularity: '人気', jockey: '騎手', sire: '父', damSire: '母父' } as const;

	const counts = $derived(placers.counts);
	/** 充足の行。0 でない項目だけ「結果がそろっている開催」に続ける。 */
	const fill = $derived(
		[
			`結果がそろっている開催 ${counts.complete}`,
			counts.partial > 0 ? `一部だけ ${counts.partial}` : null,
			counts.noResult > 0 ? `結果が未登録 ${counts.noResult}` : null,
			counts.missingYears.length > 0
				? `レースが未登録 ${counts.missingYears.length}年（${counts.missingYears.map((y) => `${y}年`).join('・')}）`
				: null
		]
			.filter((x) => x !== null)
			.join('・')
	);

	function sourcesLabel(sources: { year: string; finishPosition: number }[]): string {
		return sources.map((s) => `${s.year}年${s.finishPosition}着`).join('・');
	}

	/** 騎手・父・母父は2回以上の行だけ表に出し、1回だけの行は文に畳む。人気は段を全部出す。 */
	function tableRows(aspect: Aspect) {
		return aspect.key === 'popularity' ? aspect.rows : aspect.rows.filter((r) => r.placed >= 2);
	}
	function onceRows(aspect: Aspect) {
		return aspect.key === 'popularity' ? [] : aspect.rows.filter((r) => r.placed === 1);
	}
	function summaryLabel(aspect: Aspect): string {
		const name = ASPECT_LABEL[aspect.key];
		return aspect.unknown > 0 ? `${name}（分かる ${aspect.known}・不明 ${aspect.unknown}）` : name;
	}
</script>

{#snippet unknown(label: string)}
	<span class="text-muted-foreground">{label} 不明</span>
{/snippet}

<section class="mt-8" id="graded-placers" aria-labelledby="{id}-heading">
	<div class="flex items-center gap-1">
		<h2 id="{id}-heading" class="text-sm font-semibold text-muted-foreground">
			過去の好走馬
			<span class="font-normal">{placers.fromYear}〜{placers.toYear}年の1〜3着</span>
		</h2>
		<InfoTip
			label="過去の好走馬"
			text="レースの結果から数えたもので、自分の傾向のメモとは別です。同着を含み、同じ馬が別の年に好走したときもそれぞれ数えます。数は勝利数と3着以内の頭数で、全出走馬に対する率ではありません。"
		/>
	</div>

	{#if counts.placers === 0}
		<p class="mt-2 text-sm text-muted-foreground">
			{placers.fromYear}〜{placers.toYear}年のこのレースの結果は、まだ登録されていません。
		</p>
	{:else}
		<div class="mt-2 text-sm">
			<p>{fill}</p>
			{#if counts.differs > 0}
				<p class="mt-1">
					{counts.differs}開催は、場か距離が{placers.baseYear}年と違います。
				</p>
			{/if}
		</div>
		<p class="mt-1 text-xs text-muted-foreground">
			前走は、当時の直前の出走を確かめられるデータがまだ無いため、出していません。
		</p>

		<div class="mt-3 grid gap-2">
			{#each placers.aspects as aspect (aspect.key)}
				{@const table = tableRows(aspect)}
				{@const once = onceRows(aspect)}
				{#snippet aspectBody()}
					<summary
						class="inline-flex min-h-6 cursor-pointer items-center text-sm font-medium underline-offset-2 hover:underline"
					>
						{summaryLabel(aspect)}
					</summary>
					{#if aspect.known === 0}
						<p class="mt-1 text-sm text-muted-foreground">分かっている出走がありません。</p>
					{:else}
						{#if table.length > 0}
							<table class="mt-1 w-full text-sm">
								<caption class="sr-only"
									>{ASPECT_LABEL[aspect.key]}ごとの勝ち馬と3着以内の数</caption
								>
								<thead>
									<tr class="text-xs text-muted-foreground">
										<th scope="col" class="py-1 pr-2 text-left font-normal">
											{ASPECT_LABEL[aspect.key]}
										</th>
										<th scope="col" class="px-2 py-1 text-right font-normal">勝ち馬</th>
										<th scope="col" class="py-1 pl-2 text-right font-normal">3着以内</th>
									</tr>
								</thead>
								<tbody>
									{#each table as row (row.value)}
										<tr class="border-t align-top">
											<th scope="row" class="py-1 pr-2 text-left font-normal">
												<div>{row.value}</div>
												{#if row.sources.length > 0}
													<div class="text-xs text-muted-foreground">
														{sourcesLabel(row.sources)}
													</div>
												{/if}
											</th>
											<td class="px-2 py-1 text-right tabular-nums">{row.wins}</td>
											<td class="py-1 pl-2 text-right tabular-nums">{row.placed}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						{#if once.length > 0}
							<details class="mt-1">
								<summary
									class="inline-flex min-h-6 cursor-pointer items-center text-xs text-muted-foreground underline-offset-2 hover:underline"
								>
									1回だけ（{once.length}）
								</summary>
								<p class="mt-1 text-xs text-muted-foreground">
									{once.map((r) => `${r.value}（${sourcesLabel(r.sources)}）`).join('・')}
								</p>
							</details>
						{/if}
					{/if}
				{/snippet}
				<!-- 人気だけ開けておく。式の `open={…}` は書かない（hydration が要素に書き込み、JS が届く前に開いた欄が閉じる）。
				     直に書いた属性は触られないので、属性の有無で2つに分ける。 -->
				{#if aspect.key === 'popularity'}
					<details open>{@render aspectBody()}</details>
				{:else}
					<details>{@render aspectBody()}</details>
				{/if}
			{/each}
		</div>

		<h3 class="mt-4 text-sm font-semibold">年ごとの1〜3着</h3>
		<ol class="mt-2 space-y-4">
			{#each placers.years as y (y.year)}
				{#if y.races.length === 0}
					<li class="border-l-2 border-dashed pl-4 text-sm text-muted-foreground">
						<span class="font-bold">{y.year}年</span> このレースは未登録
					</li>
				{:else}
					{#each y.races as r (r.race.id)}
						{@const condition = conditionLabel(r.race)}
						<li class="border-l-2 border-border pl-4">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
								<span class="font-bold">{y.year}年</span>
								<span class="font-mono text-muted-foreground">{r.race.date}</span>
								<a href={resolve('/races/[id]', { id: r.race.id })} class="hover:underline">
									{condition ?? r.race.course}{r.race.trackCondition && condition
										? `・${r.race.trackCondition}`
										: ''}
								</a>
								{#if r.differs}<Badge variant="outline">条件が違う</Badge>{/if}
								{#if r.placers.length === 0}
									<span class="text-muted-foreground">結果が未登録</span>
								{:else if !r.complete}
									<span class="text-muted-foreground">一部だけ</span>
								{/if}
							</div>
							{#if r.placers.length > 0}
								<ul class="mt-1 space-y-2">
									{#each r.placers as p (p.entryId)}
										<li
											class="flex flex-col gap-y-0.5 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3"
										>
											<div
												class="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:flex-nowrap sm:gap-x-3"
											>
												<span class="w-8 shrink-0 font-medium tabular-nums"
													>{p.finishPosition}着</span
												>
												<a
													href={resolve('/horses/[id]', { id: p.horseId })}
													class="min-w-0 font-medium break-words hover:underline sm:w-36 sm:shrink-0"
												>
													{p.horseName}
												</a>
												<span class="shrink-0 sm:w-20">
													{#if p.popularity !== null}{p.popularity}番人気{:else}{@render unknown(
															'人気'
														)}{/if}
												</span>
												<span class="min-w-0 break-all sm:w-28 sm:shrink-0">
													{#if p.jockey}
														<JockeyLink
															name={p.jockey}
															summary={null}
															class="inline-flex max-w-full items-center hover:underline"
														/>
													{:else}
														{@render unknown('騎手')}
													{/if}
												</span>
											</div>
											<div class="flex min-w-0 flex-wrap items-baseline gap-x-3 pl-10 sm:pl-0">
												<span class="min-w-0 break-words sm:w-28 sm:shrink-0">
													{#if p.sire}父 {p.sire}{:else}{@render unknown('父')}{/if}
												</span>
												<span class="min-w-0 break-words sm:w-32">
													{#if p.damSire}母父 {p.damSire}{:else}{@render unknown('母父')}{/if}
												</span>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				{/if}
			{/each}
		</ol>
	{/if}
</section>
