<script lang="ts">
	import KindBadge from '$lib/components/KindBadge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils';

	/**
	 * レース直後の気づき（付けた言葉と短いメモ）を読む形で出す。読むだけで、入力は `EntryInsight`（「気づき」タブの1行。閉じた行では札なし `label={false}` で使う）。
	 *
	 * 言葉もメモも無ければ何も描かない。`unsaved` の言葉は破線で出す（まだサーバーに届いていない。
	 * 押した直後に保存済みに見せない）。`clamp` はメモを 3 行で切る（一覧の行。全文は気づきタブで行を開くと入力欄にある。ふりかえりタブの行は読むだけ）。
	 * 押せるボタンの中にも置けるよう、span だけで組む。
	 */
	let {
		words,
		memo,
		clamp = false,
		label = true,
		class: className
	}: {
		words: { word: string; unsaved?: boolean }[];
		memo: string;
		clamp?: boolean;
		/** 先頭に「気づき」の札を置くか。 */
		label?: boolean;
		class?: string;
	} = $props();

	const text = $derived(memo.trim());
</script>

{#if words.length > 0 || text !== ''}
	<span class={cn('insight-view grid gap-1', className)}>
		<span class="flex flex-wrap items-center gap-1">
			{#if label}<KindBadge label="気づき" />{/if}
			{#each words as w (w.word)}
				<Badge variant="outline" class={cn('font-normal', w.unsaved && 'border-dashed')}
					>{w.word}</Badge
				>
			{/each}
		</span>
		{#if text !== ''}
			<span class={cn('text-sm break-words whitespace-pre-wrap', clamp && 'line-clamp-3')}
				>{text}</span
			>
		{/if}
	</span>
{/if}
