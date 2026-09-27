<script lang="ts">
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import JockeyTagBadges from '$lib/components/JockeyTagBadges.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { jockeyListQuery, jockeyParam } from '$lib/utils/jockey';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const filtered = $derived(!!data.q.trim() || !!data.tag);
</script>

<svelte:head><title>騎手 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">騎手</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		出走馬に入っている騎手の一覧です。名前と、自分が付けた札で絞り込めます。
	</p>

	<form method="GET" action={resolve('/jockeys')} class="mt-4 flex gap-2">
		<Input name="q" value={data.q} placeholder="騎手名で検索" aria-label="騎手名" class="flex-1" />
		<!-- 名前で探し直しても、選んでいる札の絞り込みは残す。 -->
		{#if data.tag}<input type="hidden" name="tag" value={data.tag} />{/if}
		<Button type="submit" variant="outline">検索する</Button>
	</form>

	<!-- 自分が付けている札だけを並べる（付けていない札で絞っても0件になるだけ）。
	     GET のリンクなので JS が無くても絞れる。 -->
	{#if data.tagsInUse.length > 0}
		<nav aria-label="札で絞る" class="mt-3 flex flex-wrap items-center gap-1 text-xs">
			<span class="me-1 text-muted-foreground">札で絞る</span>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- パスは resolve() で組み、クエリを足しているだけ（frontend.md 第3章） -->
			{#each data.tagsInUse as t (t)}
				{@const active = data.tag === t}
				<a
					href={`${resolve('/jockeys')}${jockeyListQuery({ q: data.q, tag: active ? null : t })}`}
					aria-current={active ? 'true' : undefined}
					class="flex h-7 items-center gap-1 rounded-md border px-2 {active
						? 'border-primary bg-primary/10 font-medium text-foreground'
						: 'border-border text-muted-foreground hover:bg-accent'}"
				>
					{#if active}<Check class="size-3" aria-hidden="true" />{/if}
					{t}
				</a>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	{/if}

	{#if data.jockeys.length === 0}
		<p class="mt-8 text-sm text-muted-foreground">
			{#if filtered}
				条件に合う騎手はいません。
				<a href={resolve('/jockeys')} class="underline underline-offset-2">すべての騎手を見る</a>
			{:else}
				まだ騎手がいません。レースに出走馬が入ると増えます。
			{/if}
		</p>
	{:else}
		<ul class="mt-6 divide-y border-y">
			{#each data.jockeys as j (j.name)}
				<li>
					<a
						href={resolve('/jockeys/[name]', { name: jockeyParam(j.name) })}
						class="block py-3 hover:bg-muted"
					>
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="font-medium">{j.name}</span>
							<JockeyTagBadges tags={j.tags} />
						</div>
						<div class="mt-0.5 text-xs text-muted-foreground">
							騎乗 {j.rideCount} 回 ・最後 {j.lastRideDate}
							{#if j.noteCount > 0}・メモ {j.noteCount} 件{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
