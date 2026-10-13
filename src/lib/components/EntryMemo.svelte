<script lang="ts">
	import KindBadge from '$lib/components/KindBadge.svelte';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import type { NoteTag } from '$lib/schemas/note';

	/**
	 * 出走馬の閉じた行に、メモ（本文と札）をそのまま出す。行を開かなくても書いたものが読めるように。
	 *
	 * 本文は3行までで切る（長いメモで一覧が伸びない。全文は行を開くと入力欄にある）。
	 * `kind` を渡すと本文の頭に種別の札（出走前 / ふりかえり）を置く。ふりかえり画面で
	 * 出走前のメモとふりかえりのメモが並ぶので、どちらかを見分けるため。予想画面でも「出走前」を付ける
	 * （無いと、行の見出しにある「前回」の札の続きに読める）。
	 * 本文が空で札だけのメモは、段落が種別の札だけになる。本文も札も空なら何も出さない。
	 */
	let { kind, body, tags }: { kind?: '出走前' | 'ふりかえり'; body: string; tags: NoteTag[] } =
		$props();

	const text = $derived(body.trim());
</script>

{#if text !== '' || tags.length > 0}
	<div class="grid gap-1">
		<p class="line-clamp-3 text-sm break-words whitespace-pre-wrap">
			{#if kind}<span class="mr-1"><KindBadge label={kind} /></span>{/if}{text}
		</p>
		<TagBadges {tags} />
	</div>
{/if}
