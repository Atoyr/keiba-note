<script lang="ts">
	import { resolve } from '$app/paths';
	import NoteMenu from '$lib/components/NoteMenu.svelte';
	import ShareControl from '$lib/components/ShareControl.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import { noteHeading } from '$lib/utils/note';
	import { raceProgress, type ProgressTone } from '$lib/utils/dashboard';
	import { formatDateShort, isUpcoming } from '$lib/utils/date';
	import { isAdmin } from '$lib/utils/role';
	import type { PageProps } from './$types';
	import type { RaceProgressItem } from '$lib/server/services/races';

	let { data }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	const weekLabel = $derived(
		`${formatDateShort(data.week.start)} 〜 ${formatDateShort(data.week.end)}`
	);

	/** レースの行き先。まだ走っていないものはふりかえりではなく予想画面へ。 */
	const raceHref = (id: string, date: string) =>
		isUpcoming(date, data.today)
			? resolve('/races/[id]/preview', { id })
			: resolve('/races/[id]', { id });

	/** 進み具合の札の色。済んだものは緑、残っている宿題は黄、手つかずは地の色。 */
	const PROGRESS_TONE: Record<ProgressTone, string> = {
		done: 'border-emerald-200 bg-emerald-50 text-emerald-900',
		todo: 'border-amber-300 bg-amber-50 text-amber-900',
		none: 'border-gray-200 text-gray-500'
	};

	/** 本文の1行目。注目馬の行では「なぜ買い（消し）か」を一言だけ思い出せればよい。 */
	const firstLine = (body: string) => body.trim().split(/\r?\n/)[0];
</script>

<!-- 今週も過去も同じ行。違うのは並び順と、どの窓から取ってくるかだけ。 -->
{#snippet raceList(races: RaceProgressItem[])}
	<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
		{#each races as r (r.id)}
			<li>
				<!-- 今週の枠には開催前のレースが普通に入る。まだ走っていないものは
				     ふりかえりではなく予想画面へ送る（ふりかえり側も戻すが、
				     一覧から1回余計に往復させない）。 -->
				<a
					href={raceHref(r.id, r.date)}
					class="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-sm hover:bg-gray-50"
				>
					<span class="font-mono text-gray-500">{r.date}</span>
					<span>{r.course}{r.raceNumber ?? ''}R</span>
					<span class="font-medium">{r.name ?? ''}</span>
					<!-- 「メモ 3」では何が済んで何が残っているかが読めないので、種類で言う。 -->
					{#each raceProgress(r, data.today) as p (p.label)}
						<span class="rounded border px-1.5 text-[11px] leading-5 {PROGRESS_TONE[p.tone]}">
							{p.label}
						</span>
					{/each}
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<svelte:head><title>uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">ダッシュボード</h1>

	<!-- 開いて最初に知りたいのは「今週どの馬を狙うか」。自分が付けた結論の札から組む。 -->
	<section class="mt-10">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h2 class="text-sm font-semibold text-gray-500">今週出走する注目馬</h2>
			<span class="text-xs text-gray-500">次走買い・次走消しを付けた馬</span>
		</div>

		{#if data.watchlist.length === 0}
			<p class="mt-2 text-sm text-gray-500">
				ふりかえりや近況メモで「次走買い」「次走消し」を付けた馬が今週出走すると、ここに並びます。
			</p>
		{:else}
			<ul class="mt-2 grid gap-2">
				{#each data.watchlist as w (w.entryId)}
					<li
						class="rounded-lg border p-3 {w.verdict === 'buy'
							? 'border-red-200 bg-red-50/40'
							: 'border-gray-200'}"
					>
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
							<TagBadges tags={[w.verdict === 'buy' ? '次走買い' : '次走消し']} />
							<a
								href={resolve('/horses/[id]', { id: w.horseId })}
								class="font-medium hover:underline"
							>
								{w.horseName}
							</a>
							<a href={raceHref(w.raceId, w.raceDate)} class="text-gray-600 hover:underline">
								{formatDateShort(w.raceDate)}
								{w.course}{w.raceNumber ?? ''}R {w.raceName ?? ''}
								{#if w.horseNumber}<span class="font-mono">{w.horseNumber}番</span>{/if}
							</a>
						</div>
						<!-- 札を付けたときのメモ。なぜ買い（消し）と判断したかを1行だけ。 -->
						<p class="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-gray-600">
							<span class="font-mono text-gray-500">{w.noteOccurredAt}</span>
							{#if w.noteBody.trim()}
								<span class="line-clamp-1">{firstLine(w.noteBody)}</span>
							{/if}
							<TagBadges tags={w.reasons} />
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 予想したのに答え合わせをしていないレース。無いときは枠ごと出さない（宿題が無いのが普通）。 -->
	{#if data.awaiting.length > 0}
		<section class="mt-8">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
				<h2 class="text-sm font-semibold text-gray-500">ふりかえり待ち</h2>
				<span class="text-xs text-gray-500">予想したレースの答え合わせ</span>
			</div>
			<ul class="mt-2 grid gap-2">
				{#each data.awaiting as r (r.id)}
					<li>
						<a
							href={resolve('/races/[id]', { id: r.id })}
							class="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm hover:bg-amber-50"
						>
							<span class="font-mono text-gray-500">{r.date}</span>
							<span>{r.course}{r.raceNumber ?? ''}R</span>
							<span class="font-medium">{r.name ?? ''}</span>
							<span class="ms-auto text-xs text-amber-900">ふりかえりを書く →</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-8">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h2 class="text-sm font-semibold text-gray-500">今週のレース</h2>
			<span class="text-xs text-gray-500">{weekLabel}</span>
			<span class="flex-1"></span>
			{#if admin}
				<a href={resolve('/races/new')} class="text-sm text-gray-600 hover:underline">＋ 登録</a>
			{/if}
		</div>

		{#if data.thisWeek.length === 0}
			<p class="mt-2 text-sm text-gray-500">今週のレースはまだ登録されていません。</p>
		{:else}
			{@render raceList(data.thisWeek)}
		{/if}
	</section>

	<section class="mt-8">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
			<h2 class="text-sm font-semibold text-gray-500">過去のレース</h2>
			<span class="text-xs text-gray-500">直近{data.pastWeeks}週</span>
		</div>

		{#if data.past.length === 0}
			<p class="mt-2 text-sm text-gray-500">直近{data.pastWeeks}週に終わったレースはありません。</p>
		{:else}
			{@render raceList(data.past)}
		{/if}
	</section>

	<p class="mt-4 text-sm">
		<a href={resolve('/races')} class="text-gray-600 hover:underline">すべてのレースを見る →</a>
	</p>

	<section class="mt-10" aria-labelledby="recent-notes-heading">
		<h2 id="recent-notes-heading" class="text-sm font-semibold text-gray-500">最近のメモ</h2>

		{#if data.notes.length === 0}
			<div class="mt-6 rounded-md border border-gray-200 p-4">
				<p class="text-sm text-gray-600">まだメモがありません。</p>
				{#if admin}
					<p class="mt-2 text-sm text-gray-500">
						<a href={resolve('/races/new')} class="underline">レースを登録</a>
						→ 出走馬を入力 → ふりかえり、の順で書けます。
					</p>
				{:else}
					<p class="mt-2 text-sm text-gray-500">
						<a href={resolve('/races')} class="underline">レース</a>
						から書きたいレースを開くと、その場でメモを書けます。
					</p>
				{/if}
			</div>
		{:else}
			<ol class="mt-6 space-y-5">
				{#each data.notes as n (n.id)}
					{@const h = noteHeading(n)}
					<li class="border-l-2 border-gray-200 pl-4">
						<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
							<span class="font-mono text-gray-500">{n.occurredAt}</span>
							<KindBadge label={h.kindLabel} />
							{#if n.raceId}
								<!-- レース紐付きのメモは occurred_at がレース日なので、それで振り分けられる。 -->
								<a
									href={isUpcoming(n.occurredAt, data.today)
										? resolve('/races/[id]/preview', { id: n.raceId })
										: resolve('/races/[id]', { id: n.raceId })}
									class="hover:underline"
								>
									{n.horseName ? `${n.horseName} ${h.label}` : h.label}
								</a>
							{:else}
								<span>{h.label}</span>
							{/if}
							<SharedBadge visibility={n.visibility} />
							<!-- 共有は脇役なので畳む。共有中かどうかは左の札で分かる。 -->
							<div class="ms-auto self-center">
								<NoteMenu>
									<ShareControl noteId={n.id} visibility={n.visibility} redirectTo="/" />
								</NoteMenu>
							</div>
						</div>
						{#if n.body}
							<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
						{/if}
						<TagBadges tags={n.tags} class="mt-1" />
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</main>
