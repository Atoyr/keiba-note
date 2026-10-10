<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import McpUrl from '$lib/components/McpUrl.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { SCOPE_LABELS } from '$lib/schemas/oauth';
	import { todayJst } from '$lib/utils/date';
	import { formatMcpReset } from '$lib/utils/mcp-quota';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let heading = $state<HTMLHeadingElement>();

	const day = (sec: number) => todayJst(new Date(sec * 1000));

	const meters = $derived([
		{ id: 'read', label: '読み取り', ...data.usage.read },
		{ id: 'write', label: '書き込み', ...data.usage.write }
	]);
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
		><span
			>許可すれば、あなたの予想（見立て・印・札・出走前メモ）とふりかえり（レースのメモ・各馬のメモと札）も書けます。</span
		><span>近況メモの書き込みと、共有、予想とふりかえり以外のメモの削除はできません。</span>
	</p>

	<section class="mt-6 rounded-lg border p-4" aria-labelledby="mcp-url-heading">
		<h2 id="mcp-url-heading" class="font-semibold">接続先の URL</h2>
		<div class="mt-2"><McpUrl url={data.mcpUrl} /></div>
		<!-- 手順は /help/mcp に1か所だけ置く。各社の画面が変わったときに片方だけ古くならないように。 -->
		<p class="mt-3 text-sm text-muted-foreground">
			Claude か ChatGPT に uma-memo を追加するときに、この URL
			を入れます。追加するとこのサイトの許可画面が開きます。
		</p>
		<p class="mt-3 text-sm">
			<a href={resolve('/help/mcp')} class="text-primary underline underline-offset-4"
				>AIとの連携の始め方（Claude・ChatGPT での手順）</a
			>
		</p>
	</section>

	<section class="mt-6 rounded-lg border p-4" aria-labelledby="usage-heading">
		<h2 id="usage-heading" class="font-semibold">今週の利用量</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			AI
			がメモやレースのデータを読み書きした回数の、1週間の上限に対する割合です。つないだアプリすべての合計です。
		</p>
		<ul class="mt-3 space-y-3">
			{#each meters as m (m.id)}
				<li>
					<div class="flex items-baseline justify-between text-sm">
						<span id="usage-{m.id}">{m.label}</span>
						<span class="font-medium tabular-nums">{m.percent}%</span>
					</div>
					<Progress
						value={m.percent}
						aria-labelledby="usage-{m.id}"
						aria-valuetext="{m.percent}%"
						class="mt-1 h-2"
					/>
					{#if m.percent >= 100}
						<p class="mt-1 text-sm">
							上限に達しました。AI からの{m.label}は次に戻るまでできません。
						</p>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-3 text-xs text-muted-foreground">
			毎週水曜 12:00 に 0% に戻ります（次は {formatMcpReset(data.usage.resetAt)}）。
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
				解除すると、そのアプリはすぐに読み書きできなくなります。もう一度使うときは、アプリの側で接続し直してください。
			</p>
		{/if}
	</section>
</main>
