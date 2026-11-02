<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { INSIGHT_WORD_MAX } from '$lib/schemas/insight';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let wordInput = $state<HTMLInputElement | null>(null);
</script>

<svelte:head><title>気づきの言葉 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">気づきの言葉</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		レースを見た直後に、ふりかえり画面の「気づき」タブで押して残せる、自分の言葉です。どのレースの
		どの馬にも使えます（{data.limit}個まで）。
	</p>
	<p class="mt-1 text-sm text-muted-foreground">
		言葉を削除しても、これまで付けた気づきは残ります。
	</p>

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
		{#if form && 'message' in form && form.message}
			<p role="alert" class="text-sm text-destructive">{form.message}</p>
		{/if}
		{#if form && 'added' in form}
			<noscript><p class="text-sm">言葉を登録しました。</p></noscript>
		{/if}
	</form>

	<section class="mt-8" aria-labelledby="registered">
		<h2 id="registered" class="text-sm font-semibold text-muted-foreground">
			登録した言葉（{data.words.length}/{data.limit}）
		</h2>
		{#if data.words.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">
				まだ登録した言葉がありません。上の欄から足してください。
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
