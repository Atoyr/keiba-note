<script lang="ts" module>
	/**
	 * 格付けごとの色。G1=青 / G2=赤 / G3=緑 で揃え、
	 * どの画面でも同じ札に見えるようにしている。
	 * 明るさは 11px の白い文字とのコントラストが 4.5:1 以上になる段を選ぶ
	 * （G3 は green-600 だと約 3.2:1 で足りないので green-700）。
	 */
	const GRADE_CLASS: Record<string, string> = {
		G1: 'bg-blue-600 text-white',
		G2: 'bg-red-600 text-white',
		G3: 'bg-green-700 text-white'
	};
</script>

<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	/**
	 * 格付けの札。G1/G2/G3 は塗り分け、L/OP は輪郭にして階層を付ける。
	 * 出馬表の中で格付けが一目で拾えることを狙っている。
	 */
	let { grade }: { grade: string | null } = $props();
</script>

{#if grade}
	<Badge
		variant={GRADE_CLASS[grade] ? 'default' : 'outline'}
		class="px-1.5 py-0 text-[11px] {GRADE_CLASS[grade] ?? ''}"
	>
		{grade}
	</Badge>
{/if}
