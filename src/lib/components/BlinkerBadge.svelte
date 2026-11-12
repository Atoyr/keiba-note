<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { cn } from '#lib/utils.ts';

	/**
	 * ブリンカー着用の札（`B`）。**着用（true）のときだけ描く。** 着用なし・不明（null）は何も描かない
	 * （外したかどうかは前走の札の有無で読む）。見える `B` は読み上げず、「ブリンカー着用」を添える。
	 * 行の中で潰れないよう `shrink-0`。
	 */
	let { blinker, class: className }: { blinker: boolean | null; class?: string } = $props();
</script>

{#if blinker === true}
	<Badge
		variant="outline"
		class={cn('shrink-0 px-1.5 font-bold', className)}
		title="ブリンカー着用"
	>
		<span aria-hidden="true">B</span>
		<span class="sr-only">ブリンカー着用</span>
	</Badge>
{/if}
