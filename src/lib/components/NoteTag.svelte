<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	/** メモ種別の札。出走前メモをふりかえりメモと見分けるために出す。 */
	let { tag }: { tag: '出走前' | '近況' | null } = $props();
</script>

{#if tag}
	<Badge
		variant="secondary"
		class="px-1.5 py-0 text-[11px] font-normal {tag === '出走前' ? 'bg-sky-100 text-sky-900' : ''}"
	>
		{tag}
	</Badge>
{/if}
