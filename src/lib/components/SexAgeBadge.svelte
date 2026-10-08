<script lang="ts">
	import type { HorseSex } from '$lib/schemas/horse';
	import { SEX_TONE, chip } from '$lib/utils/horse-chip';

	/**
	 * 性齢の札（`牡4`）。馬詳細の頭（`HorseProfileHeader`）の性齢の札と同じ見た目で、
	 * 性別で色を分ける（牡=青・牝=ピンク・セ=緑・性が分からなければ無彩色。配色の正は `utils/horse-chip.ts`）。
	 * 色だけでは見分けない。札の中に `牡`・`牝`・`セ` の字を出し、読み上げには「性齢」を添える。
	 * `label` は `sexAgeLabel` の結果。null（性も馬齢も分からない）なら何も描かない。
	 * 行の中で潰れないよう `shrink-0`。
	 */
	let {
		sex,
		label,
		class: className = ''
	}: {
		sex: HorseSex | null;
		/** `sexAgeLabel` の結果。 */
		label: string | null;
		class?: string;
	} = $props();

	const s = $derived(chip({ tone: sex ? SEX_TONE[sex] : 'none' }));
</script>

{#if label}
	<span class="{s.base()} shrink-0 {className}">
		<span class="sr-only">性齢</span>
		<span class={s.value()}>{label}</span>
	</span>
{/if}
