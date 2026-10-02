<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SCOPE_LABELS } from '$lib/schemas/oauth';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const invalid = $derived(form?.message ?? data.invalid);
</script>

<svelte:head><title>連携の許可 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-xl px-4 py-8 sm:px-6">
	{#if invalid || !data.client}
		<h1 class="text-xl font-bold tracking-tight">連携を始められません</h1>
		<p role="alert" class="mt-3 text-sm text-destructive">{invalid}</p>
		<p class="mt-3 text-sm text-muted-foreground">
			連携しようとしたアプリの設定をやり直してください。このページからは何も許可していません。
		</p>
	{:else}
		<h1 class="text-xl font-bold tracking-tight">アプリとの連携を許可しますか</h1>
		<div class="mt-4 rounded-lg border p-4">
			<p class="font-semibold break-words">{data.client.name}</p>
			<p class="mt-1 text-sm break-all text-muted-foreground">
				許可すると、{data.client.redirectHost} に戻ります
			</p>
		</div>
		<p class="mt-3 text-sm text-muted-foreground">
			アプリの名前はアプリ自身が名乗ったものです。心当たりが無ければ許可しないでください。
		</p>

		<form method="POST" class="mt-6 space-y-6">
			{#each Object.entries(data.params) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			<fieldset>
				<legend class="font-semibold">このアプリができること</legend>
				<ul class="mt-3 space-y-3">
					{#each data.scopes as scope (scope)}
						{@const required = data.required.includes(scope)}
						<li class="flex items-start gap-3">
							<input
								id="scope-{scope}"
								type="checkbox"
								name="scope_grant"
								value={scope}
								checked
								disabled={required}
								class="mt-1 size-4 accent-primary"
								aria-describedby={required ? `scope-${scope}-required` : undefined}
							/>
							<label for="scope-{scope}" class="text-sm">
								{SCOPE_LABELS[scope]}
								{#if required}
									<span id="scope-{scope}-required" class="block text-xs text-muted-foreground"
										>連携するには必要です</span
									>
								{/if}
							</label>
						</li>
					{/each}
				</ul>
				<p class="mt-3 text-sm text-muted-foreground">
					読むことだけができます。メモの書き込み・共有・削除はできません。
				</p>
			</fieldset>
			<div class="flex flex-wrap gap-3">
				<Button type="submit" name="decision" value="allow">許可する</Button>
				<Button type="submit" name="decision" value="deny" variant="outline">許可しない</Button>
			</div>
			<p class="text-sm text-muted-foreground">
				連携は<a
					href={resolve('/settings/connections')}
					class="underline underline-offset-2 hover:text-foreground">AIとの連携</a
				>からいつでも解除できます。
			</p>
		</form>
	{/if}
</main>
