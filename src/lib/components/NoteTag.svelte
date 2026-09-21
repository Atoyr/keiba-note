<script lang="ts">
	/** メモ種別の札。出走前メモをふりかえりメモと見分けるために出す。 */
	let { tag }: { tag: '出走前' | '近況' | null } = $props();
</script>

{#if tag}
	<span
		class="rounded px-1.5 text-xs {tag === '出走前'
			? 'bg-blue-100 text-blue-800'
			: 'bg-gray-100 text-gray-600'}"
	>
		{tag}
	</span>
{/if}
