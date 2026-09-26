<script lang="ts">
	import { MARKS, type Mark } from '$lib/schemas/note';

	/**
	 * 予想印。ラジオボタンを札の見た目にしたもの。
	 *
	 * `<select>` にしなかったのは、16頭ぶん並ぶ画面で「どの馬に何を付けたか」を
	 * 一目で見渡せる必要があるため。開いて確かめる操作が16回発生すると使えない。
	 * 素のラジオなので JS 無効でも動く。
	 */
	let { name, value = null }: { name: string; value?: Mark | null } = $props();

	/**
	 * 本命だけ塗り、それ以外は薄い面か輪郭。◎ が視線を集めるようにする。
	 * △・☆・× は背景に近い灰色だと付けたのかが見分けにくいので、濃い輪郭で背景から浮かせる。
	 * × は薄いグレーの面にする。濃い面で ◎ より目立たせず、未選択の白い面とも区別する。
	 * ☆ の violet はほかで使っていない色。sky は「案内・共有中」に使っている（design-system.md 2-2）。
	 */
	const tone: Record<Mark, string> = {
		'◎': 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
		'○': 'peer-checked:bg-orange-100 peer-checked:text-orange-900 peer-checked:border-orange-400',
		'▲': 'peer-checked:bg-amber-100 peer-checked:text-amber-900 peer-checked:border-amber-400',
		'△': 'peer-checked:bg-slate-200 peer-checked:text-slate-900 peer-checked:border-slate-500',
		'☆': 'peer-checked:bg-violet-100 peer-checked:text-violet-900 peer-checked:border-violet-500',
		'×': 'peer-checked:bg-muted peer-checked:text-foreground peer-checked:border-muted-foreground'
	};

	/** ☆ と × は記号の字面が小さいので、1段大きくしてほかの印とそろえる（MarkBadge と同じ）。 */
	const glyph = (m: Mark) => (m === '☆' || m === '×' ? 'text-base' : 'text-sm');
</script>

<div class="flex items-center gap-1" role="radiogroup" aria-label="予想印">
	{#each MARKS as m (m)}
		<label class="relative">
			<input type="radio" {name} value={m} checked={value === m} class="peer sr-only" />
			<span
				class="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-not-checked:hover:bg-accent {glyph(
					m
				)} {tone[m]}"
			>
				{m}
			</span>
		</label>
	{/each}
	<label class="relative">
		<input type="radio" {name} value="" checked={!value} class="peer sr-only" />
		<span
			class="flex h-7 cursor-pointer items-center rounded-md px-1.5 text-xs text-muted-foreground peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-accent"
		>
			なし
		</span>
	</label>
</div>
