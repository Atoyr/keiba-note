<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	/**
	 * メモ種別の札。出走前メモをふりかえりメモと見分けるために出す。
	 *
	 * 名前が `NoteTag` だった頃は、ユーザーが付ける札（`TagBadges`）と
	 * 区別が付かなかった。こちらは**アプリが決める種別**で、選べない。
	 */
	let { label }: { label: '出走前' | '近況' | null } = $props();
</script>

{#if label}
	<Badge
		variant="secondary"
		class="px-1.5 py-0 text-[11px] font-normal {label === '出走前'
			? 'bg-sky-100 text-sky-900'
			: ''}"
	>
		{label}
	</Badge>
{/if}
