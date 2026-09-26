<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import ShareControl from '$lib/components/ShareControl.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let heading = $state<HTMLHeadingElement>();
</script>

<svelte:head><title>共有中のメモ — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1
		bind:this={heading}
		tabindex="-1"
		class="text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
	>
		共有中のメモ
	</h1>
	<p class="mt-1 text-sm text-gray-600">
		リンクを知っている人が見られる状態のメモです。共有をやめると、その URL はすぐ開けなくなります。
	</p>
	{#if form && 'message' in form}<p role="alert" class="mt-3 text-sm text-destructive">
			{form.message}
		</p>{/if}

	{#if data.races.length > 0}
		<section class="mt-6" aria-labelledby="shared-races-heading">
			<h2 id="shared-races-heading" class="font-semibold">共有中の予想まとめ</h2>
			<ul class="mt-3 space-y-3">
				{#each data.races as r (r.id)}
					<li class="space-y-3 rounded-lg border p-4">
						<p class="font-medium">{r.content.race.meeting} {r.content.race.name ?? ''}</p>
						<p class="text-sm text-muted-foreground">{r.content.race.spec}</p>
						<div class="flex flex-wrap gap-2">
							<Button
								href={resolve('/races/[id]/summary', { id: r.raceId })}
								variant="outline"
								size="sm">予想まとめ・共有の管理</Button
							>
							<form
								method="POST"
								use:enhance={({ cancel }) => {
									if (pending) {
										cancel();
										return;
									}
									pending = true;
									return async ({ update }) => {
										try {
											await update();
											await tick();
											heading?.focus();
										} finally {
											pending = false;
										}
									};
								}}
							>
								<input type="hidden" name="raceId" value={r.raceId} /><Button
									type="submit"
									aria-disabled={pending}
									variant="outline"
									size="sm">共有をやめる</Button
								>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<h2 class="mt-6 font-semibold">1件ずつ共有しているメモ</h2>
	{#if data.notes.length === 0}
		<p class="mt-8 text-sm text-gray-500">共有しているメモはありません。</p>
	{:else}
		<ul class="mt-6 space-y-3">
			{#each data.notes as n (n.id)}
				<li class="rounded-lg border border-gray-200 p-4">
					<p class="text-xs text-gray-500">
						{n.occurredAt}
						{#if n.horseName}・{n.horseName}{/if}
						{#if n.raceName}・{n.raceName}{/if}
					</p>
					{#if n.body}
						<p class="mt-1 line-clamp-2 text-sm whitespace-pre-wrap">{n.body}</p>
					{/if}
					<div class="mt-2">
						<ShareControl noteId={n.id} visibility={n.visibility} redirectTo="/settings/shares" />
					</div>
				</li>
			{/each}
		</ul>

		<p class="mt-6 text-xs text-gray-500">
			1件ずつ共有するメモは、共有をやめても URL
			は変わりません。もう一度共有すると、以前リンクを渡した相手がまた見られます。
		</p>
	{/if}
</main>
