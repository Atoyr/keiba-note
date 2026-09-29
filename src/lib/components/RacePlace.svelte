<script lang="ts">
	import { cn } from '$lib/utils';

	/**
	 * 一覧の行の「中山11R」。
	 *
	 * 後ろに格の札（`GradeBadge`）とレース名が続くので、幅を成り行きにすると
	 * 「福島1R」と「中山11R」で札の位置が行ごとにずれ、縦に目で追えない。
	 * 場は2文字・R は2桁までなので、「中山12R」が収まる幅を最小にして札の左端をそろえる
	 * （数字は `tabular-nums` で幅をそろえる）。
	 */
	let {
		course,
		raceNumber,
		class: className
	}: { course: string; raceNumber: number | null; class?: string } = $props();
</script>

<span class={cn('min-w-[3.75em] whitespace-nowrap tabular-nums', className)}>
	{course}{raceNumber ?? ''}R
</span>
