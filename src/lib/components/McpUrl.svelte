<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * MCP の接続先の URL と、コピーのボタン。ヘルプ（/help/mcp）と「AIとの連携」で同じものを出す。
	 * コピーできない環境（クリップボードの許可が無いなど）では、URL を選んだ状態にして手でコピーしてもらう。
	 */
	let { url }: { url: string } = $props();

	let status = $state<'idle' | 'copied' | 'manual'>('idle');
	let box = $state<HTMLElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;

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
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={copy}
			class="self-start sm:self-auto"
		>
			{status === 'copied' ? 'コピーしました' : 'URL をコピー'}
		</Button>
	</div>
	<!-- 読み上げの領域は最初から置いておく（後から足すと読まれないことがある）。空のあいだは余白を取らない。 -->
	<p class="mt-2 text-sm text-muted-foreground empty:mt-0" aria-live="polite">
		{#if status === 'copied'}
			接続先の URL をコピーしました。
		{:else if status === 'manual'}
			コピーできませんでした。選んだ URL を長押しか右クリックでコピーしてください。
		{/if}
	</p>
</div>
