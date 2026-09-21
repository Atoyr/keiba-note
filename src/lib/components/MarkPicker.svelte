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

	/** 本命だけ塗り、それ以外は輪郭。◎ が視線を集めるようにする。 */
	const tone: Record<Mark, string> = {
		'◎': 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
		'○': 'peer-checked:bg-orange-100 peer-checked:text-orange-900 peer-checked:border-orange-400',
		'▲': 'peer-checked:bg-amber-100 peer-checked:text-amber-900 peer-checked:border-amber-400',
		'△': 'peer-checked:bg-muted peer-checked:text-foreground peer-checked:border-foreground/30',
		'×': 'peer-checked:bg-muted peer-checked:text-muted-foreground peer-checked:border-border'
	};
</script>

<div class="flex items-center gap-1" role="radiogroup" aria-label="予想印">
	{#each MARKS as m (m)}
		<label class="relative">
			<input type="radio" {name} value={m} checked={value === m} class="peer sr-only" />
			<span
				class="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-sm text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-accent {tone[
					m
				]}"
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
