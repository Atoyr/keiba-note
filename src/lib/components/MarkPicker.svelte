<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { CANDIDATE_MARK, MARKS, type Mark } from '$lib/schemas/note';

	/**
	 * 予想印。ラジオボタンを札の見た目にしたもの。
	 *
	 * `<select>` にしなかったのは、16頭ぶん並ぶ画面で「どの馬に何を付けたか」を
	 * 一目で見渡せる必要があるため。開いて確かめる操作が16回発生すると使えない。
	 * 素のラジオなので JS 無効でも動く。
	 */
	let {
		name,
		value = null,
		label = '予想印',
		onpick
	}: {
		name: string;
		value?: Mark | null;
		/** radiogroup の名前。行ごとに馬名を足して渡す（読み上げで、どの馬の印か分かるように）。 */
		label?: string;
		/** 選ばれた印（「なし」は null）。行の見出しの印と「付けた印」が、保存前の選択に追従するために聞く。 */
		onpick?: (mark: Mark | null) => void;
	} = $props();

	/*
	 * 選ばれたラジオの `change` を、要素に直に付けて聞く。Svelte の `onchange` はルートへの委譲なので、
	 * 下書きの書き戻し（DraftKeeper）が投げる**泡立たない `change`** は届かない。
	 * `change` は新しく選ばれたラジオにだけ起きる（ブラウザも DraftKeeper もそう投げる）。
	 */
	const watch =
		(mark: Mark | null): Attachment<HTMLInputElement> =>
		(el) => {
			const picked = () => {
				if (el.checked) onpick?.(mark);
			};
			el.addEventListener('change', picked);
			return () => el.removeEventListener('change', picked);
		};

	/**
	 * 本命だけ塗り、それ以外は薄い面か輪郭。◎ が視線を集めるようにする。
	 * △・☆・× は背景に近い灰色だと付けたのかが見分けにくいので、濃い輪郭で背景から浮かせる。
	 * × は薄いグレーの面にする。濃い面で ◎ より目立たせず、未選択の白い面とも区別する。
	 * ☆ の violet はほかで使っていない色。sky は「案内・共有中」に使っている（design-system.md 2-2）。
	 * ✓（候補。予想の印ではない）は teal。emerald は「済み・的中」、sky は「案内・共有中」、violet は ☆ で使っている。
	 */
	const tone: Record<Mark, string> = {
		'◎': 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
		'○': 'peer-checked:bg-orange-100 peer-checked:text-orange-900 peer-checked:border-orange-400',
		'▲': 'peer-checked:bg-amber-100 peer-checked:text-amber-900 peer-checked:border-amber-400',
		'△': 'peer-checked:bg-slate-200 peer-checked:text-slate-900 peer-checked:border-slate-500',
		'☆': 'peer-checked:bg-violet-100 peer-checked:text-violet-900 peer-checked:border-violet-500',
		'✓': 'peer-checked:bg-teal-100 peer-checked:text-teal-900 peer-checked:border-teal-500',
		'×': 'peer-checked:bg-muted peer-checked:text-foreground peer-checked:border-muted-foreground'
	};

	/** ☆・✓・× は記号の字面が小さいので、1段大きくしてほかの印とそろえる（MarkBadge と同じ形で、全体を1段上げた）。 */
	const glyph = (m: Mark) => (m === '☆' || m === '✓' || m === '×' ? 'text-lg' : 'text-base');
</script>

<!--
	7つの印と「なし」を、正方形の札にして左寄せで並べる。幅が足りなければ折り返す。
	sm 以上は 40px 四方。スマホは 36px 四方にして、390px でも8枚を1行に収める（40px だと「なし」だけが2行目に回り、
	出走馬の行が毎行のびる）。36px でも指で押せる大きさ（WCAG 2.5.8 の 24px を十分に超える）。
-->
<div class="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
	{#each MARKS as m (m)}
		<label class="relative">
			<input
				type="radio"
				{name}
				value={m}
				checked={value === m}
				class="peer sr-only"
				{@attach watch(m)}
			/>
			<span
				class="flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-not-checked:hover:bg-accent sm:size-10 {glyph(
					m
				)} {tone[m]}"
			>
				{m}
				{#if m === CANDIDATE_MARK}
					<!-- 「✓」だけではスクリーンリーダーが「チェックマーク」と読み、意味が伝わらない。 -->
					<span class="sr-only">候補</span>
				{/if}
			</span>
		</label>
	{/each}
	<label class="relative">
		<input
			type="radio"
			{name}
			value=""
			checked={!value}
			class="peer sr-only"
			{@attach watch(null)}
		/>
		<span
			class="flex size-9 cursor-pointer items-center justify-center rounded-md border border-border text-xs text-muted-foreground peer-checked:border-foreground peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-not-checked:hover:bg-accent sm:size-10"
		>
			なし
		</span>
	</label>
</div>
