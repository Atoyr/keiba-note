<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * 取得を頼んでいる最中のレース。二度押しで Actions を2本起こさないよう、返事が来るまで次の送信を止める。
	 * ボタンは disabled にしない（押したボタンからフォーカスが外れ、キーボードの位置が迷子になる）。
	 */
	let pendingRaceId = $state<string | null>(null);

	const fmtDate = (unix: number) =>
		new Date(unix * 1000).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

	const entryStatus = (r: (typeof data.races)[number]) =>
		r.entryCount === 0
			? '出走馬なし'
			: r.numberedCount > 0
				? `枠順あり（${r.entryCount}頭）`
				: `候補 ${r.entryCount}頭（枠順前）`;

	/** 出走馬の取得の結果は、押した行の下に出す。凍結の失敗だけが画面の上に出る。 */
	const fetchResult = $derived(form?.raceId ? form : null);
	const pageMessage = $derived(form && !form.raceId ? form.message : null);
</script>

<svelte:head><title>管理 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">管理</h1>
	<p class="mt-1 text-sm text-gray-600">
		メンテ用の画面です。<strong>ここから他人のメモは読めません。</strong>
	</p>

	{#if pageMessage}
		<p class="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
			{pageMessage}
		</p>
	{/if}

	<h2 class="mt-8 text-sm font-bold">出走馬の取得</h2>
	<p class="mt-1 text-xs text-muted-foreground">
		netkeiba の出馬表を GitHub Actions が取り、data/races の YAML を書き換える PR を作ります。
		枠順の前なら候補、後なら枠・馬番が入ります。重賞は枠順が出ると毎時の Cron でも取りに行きます。
	</p>
	{#if !data.entriesFetch.configured}
		<p class="mt-2 rounded border bg-muted px-3 py-2 text-xs text-muted-foreground">
			GitHub のトークン（GITHUB_DISPATCH_TOKEN）が設定されていないため、取得できません。
		</p>
	{/if}
	{#if data.races.length === 0}
		<p class="mt-2 text-sm text-muted-foreground">これから2週間のレースは登録されていません。</p>
	{:else}
		<ul class="mt-2 divide-y rounded-lg border">
			{#each data.races as r (r.id)}
				{@const label = `${r.date} ${r.course}${r.raceNumber ?? ''}R ${r.name ?? ''}`.trim()}
				<li class="px-4 py-3">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span class="font-mono text-xs text-muted-foreground">{r.date}</span>
						<span class="text-sm">{r.course}{r.raceNumber ?? ''}R</span>
						{#if r.grade}
							<GradeBadge grade={r.grade} />
						{:else if r.className}
							<Badge variant="secondary">{r.className}</Badge>
						{/if}
						<a
							href={resolve('/races/[id]/preview', { id: r.id })}
							class="text-sm font-medium hover:underline"
						>
							{r.name ?? '（レース名未設定）'}
						</a>
						<span class="flex-1"></span>
						<span class="text-xs text-muted-foreground">{entryStatus(r)}</span>
						<form
							method="POST"
							action="?/fetchEntries"
							use:enhance={({ cancel }) => {
								if (pendingRaceId !== null) return cancel();
								pendingRaceId = r.id;
								return async ({ update }) => {
									await update();
									pendingRaceId = null;
								};
							}}
						>
							<input type="hidden" name="raceId" value={r.id} />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={!data.entriesFetch.configured || r.blocker !== null}
								aria-label={pendingRaceId === r.id ? undefined : `${label} の出走馬を取得する`}
							>
								{pendingRaceId === r.id ? '頼んでいます…' : '出走馬を取得する'}
							</Button>
						</form>
					</div>
					{#if fetchResult?.raceId === r.id}
						{#if fetchResult.requested}
							<p
								class="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
								role="status"
							>
								GitHub Actions に取得を頼みました。数分で PR
								ができます（前と変わりが無ければできません）。 PR をマージすると本番に入ります。
								<!-- リポジトリは wrangler.toml の GITHUB_REPOSITORY と同じ（利用規約・プライバシーの画面も直書き）。 -->
								<a
									href="https://github.com/Atoyr/keiba-note/actions/workflows/race-data-fetch.yml"
									class="underline"
									target="_blank"
									rel="noreferrer"
								>
									実行の状況を見る
								</a>
							</p>
						{:else}
							<p
								class="mt-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
								role="alert"
							>
								{fetchResult.message}
							</p>
						{/if}
					{:else if data.entriesFetch.configured && r.blocker}
						<p class="mt-1 text-xs text-muted-foreground">{r.blocker}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<h2 class="mt-8 text-sm font-bold">ユーザー</h2>
	<ul class="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
		{#each data.users as u (u.id)}
			<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
				<span class="text-sm font-medium">{u.displayName}</span>
				<span class="text-xs text-gray-500">{u.email}</span>
				{#if u.role === 'admin'}
					<span class="rounded bg-gray-900 px-1.5 py-0.5 text-[11px] text-white">admin</span>
				{/if}
				{#if u.deletedAt}
					<span class="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700">凍結済み</span>
				{/if}
				<span class="flex-1"></span>
				<span class="text-xs text-gray-400">{fmtDate(u.createdAt)}</span>
				{#if !u.deletedAt}
					<form
						method="POST"
						action="?/freeze"
						use:enhance={() =>
							({ update }) =>
								update()}
						onsubmit={(e) => {
							if (
								!confirm(
									`${u.displayName} を凍結します。ログインできなくなり、共有中のメモも非公開に戻ります。`
								)
							)
								e.preventDefault();
						}}
					>
						<input type="hidden" name="userId" value={u.id} />
						<Button type="submit" variant="outline" size="sm">凍結</Button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
</main>
