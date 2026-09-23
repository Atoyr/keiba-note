<script lang="ts" module>
	import type { NoteKindLabel } from '$lib/utils/note';

	/**
	 * 色。塗るのは「これから走る」と「レース前に書いた」の2つだけにする。
	 * メモの無い過去の出走はタイムラインで一番数が多くなるので、
	 * そこまで塗るとメモのある行が埋もれる。
	 *
	 * 見立て（レース全体）と出走前（1頭）は**同じ色**にする。どちらも
	 * 「結果を見る前に書いた」印で、そこが読み分けの軸。対象の違いは
	 * 見出しに馬名が出るかどうかで付く。
	 */
	const KIND_CLASS: Record<NoteKindLabel, string> = {
		見立て: 'bg-sky-100 text-sky-900',
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
