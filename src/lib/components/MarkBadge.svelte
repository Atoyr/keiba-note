<script lang="ts">
	import type { Mark } from '$lib/schemas/note';

	/** 付けた印の表示。MarkPicker と同じ色づけで、読むときと書くときを揃える。 */
	let { mark }: { mark: Mark | null } = $props();

	const tone: Record<Mark, string> = {
		'◎': 'bg-red-600 text-white border-red-600',
		'○': 'bg-orange-100 text-orange-900 border-orange-400',
		'▲': 'bg-amber-100 text-amber-900 border-amber-400',
		'△': 'bg-muted text-foreground border-foreground/30',
		'×': 'bg-muted text-muted-foreground border-border'
	};
</script>

{#if mark}
	<span
		class="inline-flex size-6 items-center justify-center rounded-md border text-xs {tone[mark]}"
		title="予想印 {mark}"
	>
		{mark}
	</span>
{/if}
