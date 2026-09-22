<script lang="ts">
	import { NOTE_TAGS, type NoteTag } from '$lib/schemas/note';
	import { NOTE_TAG_GROUP, type NoteTagGroup } from '$lib/utils/note';

	/**
	 * メモに付いた札の表示。`TagPicker` と同じ色づけで、読むときと書くときを揃える。
	 *
	 * 並びは渡された順ではなく `NOTE_TAGS` の順に直す。タイムラインに何件も並ぶので、
	 * メモごとに「次走買い」の出る位置が変わると走査しづらい。
	 */
	let { tags, class: className = '' }: { tags: NoteTag[]; class?: string } = $props();

	const shown = $derived(NOTE_TAGS.filter((t) => tags.includes(t)));

	const tone: Record<NoteTagGroup, string> = {
		buy: 'bg-red-600 text-white border-red-600',
		drop: 'bg-slate-700 text-white border-slate-700',
		excuse: 'bg-sky-100 text-sky-900 border-sky-400',
		merit: 'bg-amber-100 text-amber-900 border-amber-400'
	};
</script>

{#if shown.length > 0}
	<span class="inline-flex flex-wrap items-center gap-1 {className}">
		{#each shown as t (t)}
			<span
				class="inline-flex items-center rounded-md border px-1.5 py-0 text-[11px] leading-5 {tone[
					NOTE_TAG_GROUP[t]
				]}"
			>
				{t}
			</span>
		{/each}
	</span>
{/if}
