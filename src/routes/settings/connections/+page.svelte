<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import McpUrl from '$lib/components/McpUrl.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SCOPE_LABELS } from '$lib/schemas/oauth';
	import { todayJst } from '$lib/utils/date';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let heading = $state<HTMLHeadingElement>();

	const day = (sec: number) => todayJst(new Date(sec * 1000));
</script>

<svelte:head><title>AIとの連携 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1
		bind:this={heading}
		tabindex="-1"
		class="text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
	>
		AIとの連携
	</h1>
	<!-- 文の途中で改行すると、和文の間に空白が入る。文ごとに span に分けて折り返させる。 -->
	<p class="mt-1 text-sm text-muted-foreground">
		<span>Claude や ChatGPT から、レースのデータとあなたのメモを読めるようにします（MCP）。</span
		><span>読むことだけができ、書き込み・共有・削除はできません。</span>
	</p>

	<section class="mt-6 rounded-lg border p-4" aria-labelledby="mcp-url-heading">
		<h2 id="mcp-url-heading" class="font-semibold">接続先の URL</h2>
		<div class="mt-2"><McpUrl url={data.mcpUrl} /></div>
		<!-- 手順は /help/mcp に1か所だけ置く。各社の画面が変わったときに片方だけ古くならないように。 -->
		<p class="mt-3 text-sm text-muted-foreground">
			Claude か ChatGPT でコネクタを追加するときに、この URL
			を入れます。追加するとこのサイトの許可画面が開きます。
		</p>
		<p class="mt-3 text-sm">
			<a href={resolve('/help/mcp')} class="text-primary underline underline-offset-4"
				>AIとの連携の始め方（Claude・ChatGPT での手順）</a
			>
		</p>
	</section>

	<section class="mt-6" aria-labelledby="grants-heading">
		<h2 id="grants-heading" class="font-semibold">許可しているアプリ</h2>
		{#if form && 'message' in form}<p role="alert" class="mt-3 text-sm text-destructive">
				{form.message}
			</p>{/if}
		{#if data.grants.length === 0}
			<p class="mt-3 text-sm text-muted-foreground">許可しているアプリはありません。</p>
		{:else}
			<ul class="mt-3 space-y-3">
				{#each data.grants as g (g.id)}
					<li class="space-y-2 rounded-lg border p-4">
						<p class="font-medium break-words">{g.clientName}</p>
						{#if g.provider}
							<p class="text-sm break-all">提供元: {g.provider}</p>
						{/if}
						<p class="text-sm break-all text-muted-foreground">
							戻り先: {g.redirectHosts.join('、')}
						</p>
						<ul class="list-disc pl-5 text-sm">
							{#each g.scopes as scope (scope)}<li>{SCOPE_LABELS[scope]}</li>{/each}
						</ul>
						<p class="text-xs text-muted-foreground">
							許可した日 {day(g.createdAt)}{#if g.lastUsedAt}・最後に使われた日 {day(
									g.lastUsedAt
								)}{/if}
						</p>
						<form
							method="POST"
							action="?/revoke"
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
							<input type="hidden" name="grantId" value={g.id} />
							<Button type="submit" aria-disabled={pending} variant="outline" size="sm"
								>連携を解除</Button
							>
						</form>
					</li>
				{/each}
			</ul>
			<p class="mt-3 text-xs text-muted-foreground">
				解除すると、そのアプリはすぐに読めなくなります。もう一度使うときは、アプリの側で接続し直してください。
			</p>
		{/if}
	</section>
</main>
