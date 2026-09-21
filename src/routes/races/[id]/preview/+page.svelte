<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import LockIcon from '$lib/components/LockIcon.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import MarkPicker from '$lib/components/MarkPicker.svelte';
	import NoteTag from '$lib/components/NoteTag.svelte';
	import Stars from '$lib/components/Stars.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { noteHeading } from '$lib/utils/note';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const spec = $derived(
		[
			data.race.surface && data.race.distance
				? `${data.race.surface}${data.race.distance}m`
				: (data.race.surface ?? ''),
			data.race.direction ?? '',
			`${data.rows.length}頭`
		].filter(Boolean)
	);

	/** 展開している馬。1頭ずつ開く。 */
	let open = $state<string | null>(null);
</script>

<svelte:head><title>{data.race.name ?? data.race.course} 予想 — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
	<Button href={resolve('/this-week')} variant="ghost" size="sm" class="-ml-2">
		<ChevronLeft class="size-4" />
		今週の重賞
	</Button>

	<header class="mt-2">
		<div class="flex flex-wrap items-baseline gap-2">
			<h1 class="text-lg font-bold tracking-tight sm:text-xl">
				{data.race.course}{data.race.raceNumber ?? ''}R
				{data.race.name ?? ''}
			</h1>
			<GradeBadge grade={data.race.grade} />
		</div>
		<p class="mt-1 text-sm text-muted-foreground">
			{data.race.date} · {spec.join(' / ')}
		</p>
		<div class="mt-2 flex flex-wrap gap-2">
			<Button
				href={resolve('/races/[id]/entries', { id: data.race.id })}
				variant="outline"
				size="sm"
			>
				出走馬を編集
			</Button>
			<Button href={resolve('/races/[id]', { id: data.race.id })} variant="outline" size="sm">
				ふりかえりを書く
			</Button>
		</div>
	</header>

	{#if form && 'message' in form && form.message}
		<p
			class="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if form && 'saved' in form}
		{#key form.savedAt}
			<p
				class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
			>
				出走前メモを保存しました（{form.saved} 件）
			</p>
		{/key}
	{/if}

	{#if data.rows.length === 0}
		<div class="mt-6 rounded-xl border p-5">
			<p class="text-sm text-muted-foreground">出走馬がまだ登録されていません。</p>
			<Button
				href={resolve('/races/[id]/entries', { id: data.race.id })}
				variant="outline"
				size="sm"
				class="mt-3"
			>
				出走馬を入力する
			</Button>
		</div>
	{:else}
		<form method="POST" use:enhance class="mt-6">
			<ul class="grid gap-2">
				{#each data.rows as r (r.entryId)}
					<li
						class="rounded-xl border p-3 {r.myPreview?.mark === '◎'
							? 'border-red-300 bg-red-50/40'
							: ''}"
					>
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							{#if r.bracket}
								<span
									class="inline-block w-5 rounded bg-muted text-center text-xs text-muted-foreground"
								>
									{r.bracket}
								</span>
							{/if}
							<span class="w-6 text-right font-mono text-sm font-medium">
								{r.horseNumber ?? '−'}
							</span>
							<a
								href={resolve('/horses/[id]', { id: r.horseId })}
								class="font-medium hover:underline"
							>
								{r.horseName}
							</a>
							{#if r.jockey}
								<span class="text-sm text-muted-foreground">{r.jockey}</span>
							{/if}
							<span class="flex-1"></span>
							<MarkBadge mark={r.myPreview?.mark ?? null} />
						</div>

						{#if r.history.length > 0}
							<ol class="mt-2 ml-7 grid gap-2">
								{#each r.history.slice(0, open === r.entryId ? undefined : 2) as n (n.id)}
									{@const h = noteHeading(n)}
									<li class="border-l-2 pl-3">
										<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
											<span class="font-mono">{n.occurredAt}</span>
											<NoteTag tag={h.tag} />
											<span>{h.label}</span>
											<Stars rating={n.rating} />
											{#if n.visibility === 'private'}<LockIcon />{/if}
										</p>
										<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
									</li>
								{/each}
							</ol>

							{#if r.history.length > 2}
								<Button
									type="button"
									variant="link"
									size="sm"
									class="ml-5 h-auto p-0 text-xs"
									onclick={() => (open = open === r.entryId ? null : r.entryId)}
								>
									{open === r.entryId ? '閉じる' : `もっと見る（残り ${r.history.length - 2} 件）`}
								</Button>
							{/if}
						{:else}
							<p class="mt-1 ml-7 text-xs text-muted-foreground/60">過去メモなし</p>
						{/if}

						<div class="mt-3 ml-7">
							<MarkPicker name="mark.{r.entryId}" value={r.myPreview?.mark ?? null} />

							<details class="mt-2" open={!!r.myPreview?.body}>
								<summary class="cursor-pointer text-xs text-muted-foreground">
									{r.myPreview?.body ? '出走前メモ' : '＋ 出走前メモ'}
								</summary>
								<Textarea
									name="body.{r.entryId}"
									rows={2}
									placeholder="今回は内枠が向きそう。"
									class="mt-1 text-sm"
									value={r.myPreview?.body ?? ''}
								/>
								<div class="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
									<label class="flex items-center gap-1.5">
										期待度
										<select
											name="rating.{r.entryId}"
											class="rounded-md border border-input px-1.5 py-0.5"
										>
											<option value="">—</option>
											{#each [1, 2, 3, 4, 5] as n (n)}
												<option value={n} selected={r.myPreview?.rating === n}>
													{'★'.repeat(n)}
												</option>
											{/each}
										</select>
									</label>
									<label class="flex items-center gap-1.5">
										<input
											type="checkbox"
											name="visibility.{r.entryId}"
											value="private"
											checked={r.myPreview?.visibility === 'private'}
										/>
										<LockIcon />非公開
									</label>
								</div>
							</details>

							{#each r.othersPreview as n (n.id)}
								<div class="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
									<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
										<MarkBadge mark={n.mark} />
										{n.authorName}
										<Stars rating={n.rating} />
									</p>
									{#if n.body}
										<p class="mt-0.5 whitespace-pre-wrap">{n.body}</p>
									{/if}
								</div>
							{/each}
						</div>
					</li>
				{/each}
			</ul>

			<div class="sticky bottom-0 mt-6 border-t bg-background/90 py-3 backdrop-blur">
				<Button type="submit" class="w-full">出走前メモを保存</Button>
			</div>
		</form>
	{/if}
</main>
