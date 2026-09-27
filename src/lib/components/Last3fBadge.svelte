<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * 上りの上位3頭の色。1位は黄・2位は水色・3位は橙（依頼による。2026-09-27）。
	 * 色だけに頼らず、札の中に「1位」と文字でも出す。
	 * 地を薄くして字を濃くし、11〜12px の字でも 4.5:1 に届くようにしている。
	 */
	const last3fBadge = tv({
		base: 'inline-flex items-center gap-1 rounded-sm border px-1 font-mono',
		variants: {
			rank: {
				1: 'border-yellow-500 bg-yellow-200 text-yellow-950',
				2: 'border-sky-500 bg-sky-200 text-sky-950',
				3: 'border-orange-500 bg-orange-200 text-orange-950'
			}
		}
	});
</script>

<script lang="ts">
	/**
	 * 上りのタイム。上位3頭だけ、順位を添えて色の札にする。
	 * 4位以下は順位を出さない（18頭ぶん数字が並ぶと、どこが速かったかが埋もれる）。
	 */
	let { last3f, rank }: { last3f: number | null; rank: number | null } = $props();

	const top = $derived(rank === 1 || rank === 2 || rank === 3 ? rank : null);
</script>

{#if last3f !== null}
	{#if top}
		<!-- 順位を先に置く。タイムのあとに続けると「34.0 2位」が「34.02位」と1つの数に読める。 -->
		<span class={last3fBadge({ rank: top })} title="上り{top}位">
			<span class="font-sans font-semibold">上り{top}位</span>
			{last3f.toFixed(1)}
		</span>
	{:else}
		<span class="font-mono">上り{last3f.toFixed(1)}</span>
	{/if}
{/if}
