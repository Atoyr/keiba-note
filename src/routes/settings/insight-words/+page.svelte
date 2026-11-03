<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { INSIGHT_WORD_MAX } from '$lib/schemas/insight';
	import { DEFAULT_INSIGHT_WORDS } from '$lib/utils/insight-words';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let wordInput = $state<HTMLInputElement | null>(null);

	/** おすすめのうち、まだ登録していないもの（おすすめの並びのまま）。 */
	const defaults = $derived(DEFAULT_INSIGHT_WORDS.filter((w) => !data.words.includes(w)));
	const full = $derived(data.words.length >= data.limit);
</script>

<svelte:head><title>クイック入力の言葉 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">クイック入力の言葉</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		ふりかえり画面のクイック入力で押すと、その馬のふりかえりメモに入る言葉です。どのレースでも同じ言葉が並びます（{data.limit}個まで）。
	</p>
	<p class="mt-1 text-sm text-muted-foreground">言葉を削除しても、メモに入れた文は消えません。</p>

	<form
		method="POST"
		action="?/add"
		class="mt-6 space-y-2 rounded-lg border p-4"
		use:enhance={({ cancel }) => {
			if (pending) {
				cancel();
				return;
			}
			pending = true;
			return async ({ result, update }) => {
				try {
					// 失敗したときは入力を残す（reset: false）。成功したら欄を空にして続けて足せるようにする。
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') toast.success('言葉を登録しました');
				} finally {
					pending = false;
				}
			};
		}}
	>
		<Label for="word">新しい言葉</Label>
		<div class="flex flex-wrap items-center gap-2">
			<Input
				id="word"
				bind:ref={wordInput}
				name="word"
				maxlength={INSIGHT_WORD_MAX}
				value={form && 'word' in form && form.word && !('added' in form) ? form.word : ''}
				placeholder="例：上がりが強い"
				class="w-full max-w-xs"
				aria-describedby="word-help"
			/>
			<Button type="submit" aria-disabled={pending}>{pending ? '登録中…' : '登録する'}</Button>
		</div>
		<p id="word-help" class="text-sm text-muted-foreground">
			{INSIGHT_WORD_MAX}文字以内。同じ言葉は2つ登録できません。
		</p>
		{#if form && 'message' in form && form.message && !('source' in form)}
			<p role="alert" class="text-sm text-destructive">{form.message}</p>
		{/if}
		{#if form && 'added' in form}
			<noscript><p class="text-sm">言葉を登録しました。</p></noscript>
		{/if}
	</form>

	{#if defaults.length > 0}
		<section class="mt-6" aria-labelledby="defaults">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h2 id="defaults" class="text-sm font-semibold text-muted-foreground">おすすめの言葉</h2>
				{#if !full}
					<form
						method="POST"
						action="?/addDefaults"
						use:enhance={({ cancel }) => {
							if (pending) {
								cancel();
								return;
							}
							pending = true;
							return async ({ result, update }) => {
								try {
									await update({ reset: false });
									if (result.type === 'success') {
										const n = (result.data?.addedDefaults as string[] | undefined)?.length ?? 0;
										toast.success(
											`おすすめの言葉を${n}個登録しました` +
												(result.data?.limited
													? `。上限（${data.limit}個）に達したため、残りは登録していません`
													: '')
										);
									}
								} finally {
									pending = false;
								}
							};
						}}
					>
						<input type="hidden" name="source" value="defaults" />
						<Button
							type="submit"
							variant="outline"
							class="min-h-11 w-full sm:min-h-9 sm:w-auto"
							aria-disabled={pending}
							>{pending ? '登録中…' : `まとめて登録する（${defaults.length}個）`}</Button
						>
					</form>
				{/if}
			</div>
			{#if full}
				<p class="mt-2 text-sm text-muted-foreground">上限（{data.limit}個）に達しています。</p>
			{:else}
				<ul class="mt-2 flex flex-wrap gap-2">
					{#each defaults as w (w)}
						<li>
							<form
								method="POST"
								action="?/add"
								use:enhance={({ cancel }) => {
									if (pending) {
										cancel();
										return;
									}
									pending = true;
									return async ({ result, update }) => {
										try {
											await update({ reset: false });
											if (result.type === 'success') toast.success('言葉を登録しました');
										} finally {
											pending = false;
										}
									};
								}}
							>
								<input type="hidden" name="word" value={w} />
								<input type="hidden" name="source" value="defaults" />
								<Button
									type="submit"
									variant="outline"
									class="min-h-11 sm:min-h-9"
									aria-disabled={pending}>{w}<span class="sr-only">を登録する</span></Button
								>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			{#if form && 'source' in form && form.message}
				<p role="alert" class="mt-2 text-sm text-destructive">{form.message}</p>
			{/if}
			{#if form && 'addedDefaults' in form}
				<noscript><p class="mt-2 text-sm">おすすめの言葉を登録しました。</p></noscript>
			{/if}
		</section>
	{/if}

	<section class="mt-8" aria-labelledby="registered">
		<h2 id="registered" class="text-sm font-semibold text-muted-foreground">
			登録した言葉（{data.words.length}/{data.limit}）
		</h2>
		{#if data.words.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">
				まだ登録した言葉がありません。上の欄か、おすすめから足してください。
			</p>
		{:else}
			<ul class="mt-2 divide-y rounded-lg border">
				{#each data.words as word (word)}
					<li class="flex items-center justify-between gap-2 px-3 py-1">
						<span class="min-w-0 text-sm break-words">{word}</span>
						<form
							method="POST"
							action="?/remove"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
									// 押したボタンは消えるので、フォーカスを「新しい言葉」の欄へ移す。
									await tick();
									wordInput?.focus();
								}}
						>
							<input type="hidden" name="word" value={word} />
							<Button type="submit" variant="ghost" size="sm" class="min-h-11 sm:min-h-9">
								削除<span class="sr-only">（{word}）</span>
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		{#if form && 'removed' in form}
			<noscript><p class="mt-2 text-sm">言葉を削除しました。</p></noscript>
		{/if}
	</section>
</main>
