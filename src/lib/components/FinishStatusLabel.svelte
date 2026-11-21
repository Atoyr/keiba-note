<script lang="ts">
	import type { FinishStatus } from '#lib/schemas/race.ts';
	import { cn } from '#lib/utils.ts';

	/**
	 * 着順が無い理由（取消・除外・中止・失格）を、着順の位置に語で出す。字だけで、太字にも色付けにもしない
	 * （走らなかった理由を静かに読ませる。行は薄くしない）。無ければ何も描かない。
	 */
	let { status, class: className }: { status: FinishStatus | null; class?: string } = $props();
</script>

{#if status}
	<span class={cn('text-muted-foreground', className)}>{status}</span>
{/if}
