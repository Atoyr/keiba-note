<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head><title>プロフィール — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">プロフィール</h1>
	<form
		method="POST"
		class="mt-6 space-y-4 rounded-lg border p-4"
		use:enhance={({ cancel }) => {
			if (pending) {
				cancel();
				return;
			}
			pending = true;
			return async ({ result, update }) => {
				try {
					await update({ reset: false });
					if (result.type === 'success') toast.success('公開用の名前を保存しました');
				} finally {
					pending = false;
				}
			};
		}}
	>
		<div class="space-y-2">
			<Label for="publicName">公開用の名前</Label>
			<Input
				id="publicName"
				name="publicName"
				maxlength={30}
				value={form && 'publicName' in form ? form.publicName : (data.publicName ?? '')}
				placeholder="例：週末うまメモ"
				aria-describedby="public-name-help"
			/>
			<p id="public-name-help" class="text-sm text-muted-foreground">
				共有ページに表示する名前です（30文字以内）。空欄なら「匿名」になります。Google
				の名前やメールアドレスは共有ページに表示しません。
			</p>
			<p class="text-sm text-muted-foreground">
				変更は、すでに共有しているページにも反映されます。
			</p>
		</div>
		{#if form && 'message' in form}<p role="alert" class="text-sm text-destructive">
				{form.message}
			</p>{/if}
		{#if form && 'saved' in form}<noscript
				><p class="text-sm">公開用の名前を保存しました。</p></noscript
			>{/if}
		<Button type="submit" aria-disabled={pending}
			>{pending ? '保存中…' : '公開用の名前を保存'}</Button
		>
	</form>
</main>
