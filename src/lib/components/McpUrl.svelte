<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * MCP の接続先の URL と、コピーのボタン。ヘルプ（/help/mcp）と「AIとの連携」で同じものを出す。
	 * コピーできたらトーストで知らせる（design-system.md 第3章）。できなければ（クリップボードの許可が無いなど）
	 * URL を選んだ状態にし、手でのコピーを頼む文を画面に残す。
	 * ボタンは JS が動いてから出す（JS が無いと押しても何も起きない。URL は文として見えているので手で写せる）。
	 */
	let { url }: { url: string } = $props();

	let ready = $state(false);
	let status = $state<'idle' | 'copied' | 'manual'>('idle');
	let box = $state<HTMLElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		ready = true;
		return () => clearTimeout(timer);
	});

	function selectUrl() {
		if (!box) return;
		const range = document.createRange();
		range.selectNodeContents(box);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	async function copy() {
		clearTimeout(timer);
		try {
			await navigator.clipboard.writeText(url);
			status = 'copied';
			toast.success('接続先の URL をコピーしました');
			timer = setTimeout(() => (status = 'idle'), 2000);
		} catch {
			selectUrl();
			status = 'manual';
		}
	}
</script>

<div>
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
		<p bind:this={box} class="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
			{url}
		</p>
		{#if ready}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={copy}
				class="self-start sm:self-auto"
			>
				{status === 'copied' ? 'コピーしました' : 'URL をコピー'}
			</Button>
		{/if}
	</div>
	{#if status === 'manual'}
		<p role="alert" class="mt-2 text-sm text-destructive">
			コピーできませんでした。選んだ URL を長押しか右クリックでコピーしてください。
		</p>
	{/if}
</div>
