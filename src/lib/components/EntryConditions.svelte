<script lang="ts">
	import { cn } from '#lib/utils.ts';
	import type { ConditionItem } from '#lib/utils/entry-conditions.ts';

	/**
	 * 予想画面の出走馬の行に出す、今回の条件（乗り替わり・騎手変更・斤量）と前走からの変化。
	 * 並べるだけ（組み立ては `entryConditions`）。変化のある項目（乗り替わり・騎手変更・斤量の増減・着用開始/外す）は項目ごと太めに、
	 * ほかは控えめに出し、色ではなく語で区別する。項目単位で折り返す。
	 */
	let { items, class: className }: { items: ConditionItem[]; class?: string } = $props();
</script>

{#if items.length > 0}
	<ul
		class={cn(
			'flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs leading-5 text-muted-foreground',
			className
		)}
		aria-label="今回の条件"
	>
		{#each items as item (item.lead)}
			<li>
				<span class={item.strong ? 'font-medium text-foreground' : undefined}
					>{item.lead}{item.rest}</span
				>
			</li>
		{/each}
	</ul>
{/if}
