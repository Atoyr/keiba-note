<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import DraftKeeper from '$lib/components/DraftKeeper.svelte';
	import PastRuns from '$lib/components/PastRuns.svelte';
	import SharedBadge from '$lib/components/SharedBadge.svelte';
	import MarkBadge from '$lib/components/MarkBadge.svelte';
	import MarkPicker from '$lib/components/MarkPicker.svelte';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { noteHeading } from '$lib/utils/note';
	import { isAdmin } from '$lib/utils/role';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const admin = $derived(isAdmin(data.user));

	// 下書きの置き場。レースとユーザーで分ける。
	let formEl = $state<HTMLFormElement | null>(null);
	let keeper = $state<DraftKeeper | null>(null);
	const draftKey = $derived(`k-note:draft:preview:${page.data.user?.id ?? '-'}:${data.race.id}`);

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

<svelte:head><title>{data.race.name ?? data.race.course} 予想 — k-note</title></svelte:head>

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
			{#if admin}
				<Button
					href={resolve('/races/[id]/entries', { id: data.race.id })}
					variant="outline"
					size="sm"
				>
					出走馬を編集
				</Button>
			{/if}
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
			{#if admin}
				<Button
					href={resolve('/races/[id]/entries', { id: data.race.id })}
					variant="outline"
					size="sm"
					class="mt-3"
				>
					出走馬を入力する
				</Button>
			{/if}
		</div>
	{:else}
		<form
			method="POST"
			bind:this={formEl}
			use:enhance={() =>
				async ({ result, update }) => {
					if (result.type === 'success') keeper?.clear();
					// **reset: false が必須。** 既定の update() はフォームを reset() するが、
					// Svelte はテキストエリアを .value で更新するので defaultValue は空のまま。
					// リセットすると全欄が空になり、そのあとの再描画では値が変わっていない
					// メモが「変化なし」と判断されて描き直されない。
					// 結果、保存した直後に中身が消えたように見える。
					// このフォームは「空欄＝そのメモを消す」仕様なので、そこでもう一度
					// 保存すると本当に消える。表示はサーバーの data が正で、
					// フォームの初期値ではない。
					await update({ reset: false });
				}}
			class="mt-6"
		>
			<DraftKeeper bind:this={keeper} form={formEl} storageKey={draftKey} />
			<ul class="grid gap-2">
				{#each data.rows as r (r.entryId)}
					{@const hasPreview = !!r.myPreview?.body || (r.myPreview?.tags.length ?? 0) > 0}
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

						<!-- 馬柱は薄い面に載せて、下に続く「自分のメモ」と見分けられるようにする。
						     どちらも小さい文字の塊なので、囲いが無いと1つの塊に見える。 -->
						<div class="mt-1.5 ml-7 rounded-md bg-muted/50 px-2.5 py-1">
							<PastRuns runs={r.pastRuns} />
						</div>

						{#if r.history.length > 0}
							<ol class="mt-2 ml-7 grid gap-2">
								{#each r.history.slice(0, open === r.entryId ? undefined : 2) as n (n.id)}
									{@const h = noteHeading(n)}
									<li class="border-l-2 pl-3">
										<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
											<span class="font-mono">{n.occurredAt}</span>
											<KindBadge label={h.kindLabel} />
											<span>{h.label}</span>
											<SharedBadge visibility={n.visibility} />
										</p>
										{#if n.body}
											<p class="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
										{/if}
										<TagBadges tags={n.tags} class="mt-1" />
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

							<!-- 書いた出走前メモは畳まない。**畳むのは書く側だけ**にする。
							     16頭ぶん並ぶ画面で1頭ずつ開かないと自分の見解が読めないのでは、
							     馬を見比べるという予想画面の用が足りない。
							     開いていないときに出すのは本文と**付けた札だけ**で、
							     選んでいない札（`TagPicker` の全選択肢）は伏せておく。
							     `<details>` のままなのは JS 無効でも開けるため（design.md 第6章）。 -->
							<details class="group mt-2">
								<summary class="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
									{#if hasPreview}
										<!-- 開いている間は下の入力欄が正なので、同じ文を二重に見せない。 -->
										<span class="block group-open:hidden">
											<!-- 改行を保つので、テンプレート側の字下げを入れないよう1行で書く。 -->
											{#if r.myPreview?.body}<span
													class="block text-sm leading-relaxed whitespace-pre-wrap"
													>{r.myPreview.body}</span
												>{/if}
											<TagBadges tags={r.myPreview?.tags ?? []} class="mt-1" />
										</span>
										<span
											class="text-xs text-muted-foreground underline-offset-2 group-open:hidden hover:underline"
										>
											書き直す
										</span>
									{:else}
										<span
											class="text-xs text-muted-foreground underline-offset-2 group-open:hidden hover:underline"
										>
											＋ 出走前メモ
										</span>
									{/if}
									<span
										class="hidden text-xs text-muted-foreground underline-offset-2 group-open:inline hover:underline"
									>
										閉じる
									</span>
								</summary>
								<Textarea
									name="body.{r.entryId}"
									rows={2}
									placeholder="今回は内枠が向きそう。"
									class="mt-1 text-sm"
									value={r.myPreview?.body ?? ''}
								/>
								<div class="mt-1.5">
									<TagPicker name="tags.{r.entryId}" values={r.myPreview?.tags ?? []} />
								</div>
							</details>
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
