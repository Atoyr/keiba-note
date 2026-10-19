<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HorseSex, TrainingCenter } from '$lib/schemas/horse';
	import { sexAgeLabel } from '$lib/utils/horse';
	import { SEX_TONE, chip, type Tone } from '$lib/utils/horse-chip';
	import HorseProfileBadges from './HorseProfileBadges.svelte';

	/**
	 * 馬詳細の頭。生年月日の行、名前の行（性別の札・`heading`＝h1・右端に `actions`＝推しの★）、プロフィールの札を出す。
	 *
	 * ```
	 * 2021年4月4日生
	 * [牡6] 馬名                                  ★
	 * [父 ○○]
	 * [母 ○○] [母父 ○○]
	 * [栗東] [調教師 ○○]
	 * ```
	 *
	 * 性別の札は性齢（`牡6`。性だけなら `牡`、馬齢だけなら `6歳`）。馬齢は `currentYear - birthYear`（JRA は1月1日に一斉に加齢する）。
	 * 生年月日の行は生年月日が正（生年だけなら `2021年生`）。値の無い項目は出さず、項目が1つも無い行は描かない。
	 * 名前の行の★のほかは左寄せで、折り返しても左から詰まる。ラベルと値の組なので行ごとに `dl` で組み、読み上げで「父 ○○」と対になるようにする。
	 * 父・母・母父・所属・調教師の札は `HorseProfileBadges`（出走馬の行の馬名を押して開く枠と共通）。
	 * 生年月日・性齢・所属は字だけで伝わるのでラベルは読み上げ専用（sr-only）。
	 * 色は `utils/horse-chip.ts` の `chip`。ラベルを `bg-muted` 上の `text-muted-foreground` にすると 4.5:1 に届かない（約 4.35:1）ので、無彩色の地は `bg-background`。
	 */
	let {
		heading,
		actions,
		sex,
		birthDate,
		birthYear,
		currentYear,
		sire,
		dam,
		damSire,
		trainer,
		trainingCenter,
		class: className = ''
	}: {
		heading: Snippet;
		/** 名前の行の右端（推しの★のフォーム）。 */
		actions: Snippet;
		sex: HorseSex | null;
		/** `YYYY-MM-DD`。 */
		birthDate: string | null;
		birthYear: number | null;
		/** 今の年（JST）。馬齢を数える。 */
		currentYear: number;
		sire: string | null;
		dam: string | null;
		damSire: string | null;
		trainer: string | null;
		trainingCenter: TrainingCenter | null;
		class?: string;
	} = $props();

	/** 月日は0埋めしない。生年月日が無く生年だけなら `2021年生`。 */
	const born = $derived.by(() => {
		const m = birthDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate) : null;
		if (m) return { label: '生年月日', text: `${m[1]}年${Number(m[2])}月${Number(m[3])}日生` };
		if (birthYear) return { label: '生年', text: `${birthYear}年生` };
		return null;
	});

	type Item = { key: string; label: string; srOnly: boolean; value: string; tone: Tone };

	const sexAge = $derived(sexAgeLabel(sex, birthYear, `${currentYear}-01-01`));

	const sexItem = $derived<Item | null>(
		sexAge
			? {
					key: 'sex',
					label: '性齢',
					srOnly: true,
					value: sexAge,
					tone: sex ? SEX_TONE[sex] : 'none'
				}
			: null
	);
</script>

{#snippet badge(item: Item)}
	{@const s = chip({ tone: item.tone })}
	<div class={s.base()}>
		<dt class={item.srOnly ? 'sr-only' : s.label()}>{item.label}</dt>
		<dd class={s.value()}>{item.value}</dd>
	</div>
{/snippet}

<div class="flex flex-col gap-2 {className}">
	{#if born}
		<dl class="-mb-1 text-sm text-muted-foreground">
			<div>
				<dt class="sr-only">{born.label}</dt>
				<dd>{born.text}</dd>
			</div>
		</dl>
	{/if}
	<div class="flex flex-nowrap items-center gap-2">
		{#if sexItem}
			<dl class="shrink-0">{@render badge(sexItem)}</dl>
		{/if}
		{@render heading()}
		<div class="ms-auto shrink-0">{@render actions()}</div>
	</div>
	<HorseProfileBadges {sire} {dam} {damSire} {trainer} {trainingCenter} />
</div>
