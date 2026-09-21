<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	/**
	 * 格付けの札。G1 だけ塗り、G2/G3 は輪郭にして階層を付ける。
	 * 出馬表の中で G1 が一目で拾えることを狙っている。
	 */
	let { grade }: { grade: string | null } = $props();
</script>

{#if grade}
	<Badge variant={grade === 'G1' ? 'default' : 'outline'} class="px-1.5 py-0 text-[11px]">
		{grade}
	</Badge>
{/if}
