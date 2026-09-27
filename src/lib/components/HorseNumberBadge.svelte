<script lang="ts" module>
	/**
	 * 馬番の面の色。**枠の色を薄くしたもの**にし、縁は枠の札と同じ色にする。
	 * 枠の札と馬番をくっつけて1つの札に見せ、馬番の面の色でも枠が分かるようにする
	 * （枠の札と馬番が離れていて、馬番だけ見ても枠が読めなかった）。
	 *
	 * 面が薄いので、文字はどの枠も黒に置く。1枠（白）は薄くしても白。
	 */
	export const HORSE_NUMBER_CLASS: Record<number, string> = {
		1: 'bg-white border-gray-400',
		2: 'bg-gray-200 border-gray-900',
		3: 'bg-red-100 border-red-600',
		4: 'bg-blue-100 border-blue-600',
		5: 'bg-yellow-100 border-yellow-500',
		6: 'bg-green-100 border-green-600',
		7: 'bg-orange-100 border-orange-500',
		8: 'bg-pink-100 border-pink-400'
	};
</script>

<script lang="ts">
	import { BRACKET_CLASS } from '$lib/components/BracketBadge.svelte';

	/**
	 * 枠番と馬番の札。左に枠番（帽子の色そのまま）、右に馬番（枠の色を薄くした面）を
	 * 隙間なく並べる。**色だけに意味を持たせず、どちらも数字を出す**（BracketBadge と同じ）。
	 *
	 * - 枠が未確定（NULL）で馬番だけあるときは、馬番を色の無い面で出す
	 * - 枠も馬番も無い（出馬表が出る前）ときは何も出さない
	 *
	 * 馬番の幅は2桁に合わせて固定する。1頭1行で縦に並べたときに馬名の頭がそろう。
	 *
	 * 読み上げでは数字が2つ続くだけになる（title は読まれないことが多い）ので、
	 * 札全体に「2枠3番」という名前を付ける。
	 */
	let { bracket, horseNumber }: { bracket: number | null; horseNumber: number | null } = $props();

	const hasBracket = $derived(!!bracket && !!BRACKET_CLASS[bracket]);
	const numberClass =
		'inline-flex w-6 items-center justify-center border font-mono text-sm font-semibold text-gray-900';
</script>

{#if hasBracket && bracket}
	<span
		class="inline-flex h-6 shrink-0"
		role="img"
		aria-label="{bracket}枠{horseNumber ? `${horseNumber}番` : ''}"
	>
		<span
			class="inline-flex w-5 items-center justify-center rounded-l border text-xs font-medium {BRACKET_CLASS[
				bracket
			]}"
			title="{bracket}枠"
		>
			{bracket}
		</span>
		<span
			class="{numberClass} rounded-r border-l-0 {HORSE_NUMBER_CLASS[bracket]}"
			title={horseNumber ? `${horseNumber}番` : undefined}
		>
			{horseNumber ?? '−'}
		</span>
	</span>
{:else if horseNumber}
	<span
		class="{numberClass} h-6 shrink-0 rounded border-border bg-muted"
		title="{horseNumber}番"
		role="img"
		aria-label="{horseNumber}番"
	>
		{horseNumber}
	</span>
{/if}
