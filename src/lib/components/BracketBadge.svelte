<script lang="ts" module>
	/**
	 * 枠番の色。**JRA の帽子の色そのまま**にする
	 * （1白 / 2黒 / 3赤 / 4青 / 5黄 / 6緑 / 7橙 / 8桃）。
	 * ここを見やすさで置き換えると、中継や新聞を見ながら読む人の頭の中と食い違う。
	 *
	 * 白（1枠）は面が背景と同じなので、輪郭だけで枠だと分かるようにする。
	 * 黄・橙・桃は面が明るいので文字を黒に置く（白抜きだと読めない）。
	 *
	 * 展開の盤面のコマ（`RaceFlowBoard`）も同じ色にする。
	 */
	export const BRACKET_CLASS: Record<number, string> = {
		1: 'bg-white text-gray-900 border-gray-400',
		2: 'bg-gray-900 text-white border-gray-900',
		3: 'bg-red-600 text-white border-red-600',
		4: 'bg-blue-600 text-white border-blue-600',
		5: 'bg-yellow-300 text-gray-900 border-yellow-500',
		6: 'bg-green-600 text-white border-green-600',
		7: 'bg-orange-400 text-gray-900 border-orange-500',
		8: 'bg-pink-300 text-gray-900 border-pink-400'
	};
</script>

<script lang="ts">
	/**
	 * 枠番の札。**色だけに意味を持たせず、必ず数字を中に出す。**
	 * 色で分からない人にも枠が読めるようにするため。
	 *
	 * 枠が未確定（NULL）のあいだは何も出さない。出馬表が出る前のレースでは
	 * 枠も馬番も空なので、空の札を並べても場所を取るだけになる。
	 */
	let { bracket }: { bracket: number | null } = $props();
</script>

{#if bracket && BRACKET_CLASS[bracket]}
	<span
		class="inline-flex size-5 shrink-0 items-center justify-center rounded border text-xs font-medium {BRACKET_CLASS[
			bracket
		]}"
		title="{bracket}枠"
	>
		{bracket}
	</span>
{/if}
