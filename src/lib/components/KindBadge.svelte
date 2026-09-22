<script lang="ts" module>
	import type { NoteKindLabel } from '$lib/utils/note';

	/**
	 * 色。塗るのは「これから走る」と「レース前に書いた」の2つだけにする。
	 * メモの無い過去の出走はタイムラインで一番数が多くなるので、
	 * そこまで塗るとメモのある行が埋もれる。
	 */
	const KIND_CLASS: Record<NoteKindLabel, string> = {
		出走前: 'bg-sky-100 text-sky-900',
		出走予定: 'bg-emerald-100 text-emerald-900',
		近況: '',
		出走: ''
	};
</script>

<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	/**
	 * タイムラインの行種別の札。**アプリが決めるもの**で、ユーザーは選べない。
	 *
	 * 名前が `NoteTag` だった頃は、ユーザーが付ける札（`TagBadges`）と
	 * 区別が付かなかった。こちらはメモの kind（`出走前` / `近況`）と、
	 * **メモの無い出走**（`出走` / `出走予定`）を見分けるために出す。
	 */
	let { label }: { label: NoteKindLabel | null } = $props();
</script>

{#if label}
	<Badge variant="secondary" class="px-1.5 py-0 text-[11px] font-normal {KIND_CLASS[label]}">
		{label}
	</Badge>
{/if}
