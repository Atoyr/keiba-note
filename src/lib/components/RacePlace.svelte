<script lang="ts">
	import { cn } from '$lib/utils';

	/**
	 * 一覧の行の「中山11R」。
	 *
	 * 後ろに格の札（`GradeBadge`）とレース名が続くので、幅を成り行きにすると
	 * 「福島1R」と「中山11R」で札の位置が行ごとにずれ、縦に目で追えない。
	 * 場は2文字・R は2桁までなので、「中山12R」が収まる幅を最小にして札の左端をそろえる
	 * （数字は `tabular-nums` で幅をそろえる）。使う行はどれも本文の字（`text-sm`、14px）で、
	 * 「中山12R」は Windows の既定のフォントで約 3.7em（約 52px）。等幅（今週の重賞）や Mac のフォントでは
	 * 少し広がりうるので、余裕を見て既定の段の `min-w-14`（56px ＝ 14px の 4em）にしている。
	 */
	let {
		course,
		raceNumber,
		class: className
	}: { course: string; raceNumber: number | null; class?: string } = $props();
</script>

<span class={cn('inline-block min-w-14 whitespace-nowrap tabular-nums', className)}>
	{course}{raceNumber ?? ''}R
</span>
