<script lang="ts">
	import { NOTE_TAGS, type NoteTag } from '$lib/schemas/note';
	import { NOTE_TAG_GROUP, type NoteTagGroup } from '$lib/utils/note';

	/**
	 * 札を選ぶ。チェックボックスを札の見た目にしたもの。
	 *
	 * `<select multiple>` にしないのは、16頭ぶん並ぶ画面で「どの馬に何を付けたか」を
	 * 開かずに見渡せる必要があるため（`MarkPicker` と同じ理由）。
	 * 素のチェックボックスなので JS 無効でも動く。
	 *
	 * **1つも選ばなければ、この name はフォームに乗らない。** 受け側は
	 * `form.getAll(name)` が空配列になる前提で読むこと（`tagsSchema` の既定が `[]`）。
	 */
	let { name, values = [] }: { name: string; values?: NoteTag[] } = $props();

	/**
	 * **結論（買い／消し）だけを塗る。** 理由は淡い色に留めて、結論に視線が行くようにする。
	 *
	 * hover を `peer-not-checked:` で絞っているのは、選択中の札に指を置いたときに
	 * hover の色が塗りを上書きして「外れた」ように見えるため（同じ強さの指定で、
	 * CSS の順番で hover が勝つ）。
	 */
	const tone: Record<NoteTagGroup, string> = {
		buy: 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
		drop: 'peer-checked:bg-slate-700 peer-checked:text-white peer-checked:border-slate-700',
		excuse: 'peer-checked:bg-sky-100 peer-checked:text-sky-900 peer-checked:border-sky-400',
		merit: 'peer-checked:bg-amber-100 peer-checked:text-amber-900 peer-checked:border-amber-400'
	};
</script>

<div class="flex flex-wrap items-center gap-1" role="group" aria-label="メモの札">
	{#each NOTE_TAGS as t (t)}
		<label class="relative">
			<input type="checkbox" {name} value={t} checked={values.includes(t)} class="peer sr-only" />
			<span
				class="flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-xs text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-not-checked:hover:bg-accent {tone[
					NOTE_TAG_GROUP[t]
				]}"
			>
				{t}
			</span>
		</label>
	{/each}
</div>
