<script lang="ts">
	import type { Mark } from '$lib/schemas/note';

	/** 付けた印の表示。MarkPicker と同じ色づけで、読むときと書くときを揃える。 */
	let { mark }: { mark: Mark | null } = $props();

	const tone: Record<Mark, string> = {
		'◎': 'bg-red-600 text-white border-red-600',
		'○': 'bg-orange-100 text-orange-900 border-orange-400',
		'▲': 'bg-amber-100 text-amber-900 border-amber-400',
		'△': 'bg-slate-200 text-slate-900 border-slate-500',
		'☆': 'bg-violet-100 text-violet-900 border-violet-500',
		'×': 'bg-muted text-foreground border-muted-foreground'
	};

	/** ☆ と × は記号の字面が小さいので、1段大きくしてほかの印とそろえる。 */
	const glyph = (m: Mark) => (m === '☆' || m === '×' ? 'text-sm' : 'text-xs');
</script>

{#if mark}
	<span
		class="inline-flex size-6 items-center justify-center rounded-md border {glyph(mark)} {tone[
			mark
		]}"
		title="予想印 {mark}"
	>
		{mark}
	</span>
{/if}
