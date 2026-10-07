<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * 札の色（依頼による。2026-10-06）。性別でそろえ、牡と父を青・牝と母をピンク・セ馬を緑、
	 * 母父は父の系統なので父と同じ青、所属は美浦を紺・栗東を橙にする。地方・海外・調教師は無彩色。
	 * 色だけに頼らず、札の中に `牡`・`父`・`母父`・`栗東` などの字を必ず出す。
	 * 地を50番台・字を950番台・ラベルを700番台にして、12px の字でも 4.5:1 に届くようにしている。
	 */
	const chip = tv({
		slots: {
			base: 'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
			label: '',
			value: 'font-medium'
		},
		variants: {
			tone: {
				none: {
					base: 'border-border bg-background text-foreground',
					label: 'text-muted-foreground'
				},
				blue: {
					base: 'border-blue-300 bg-blue-50 text-blue-950',
					label: 'text-blue-700'
				},
				pink: {
					base: 'border-pink-300 bg-pink-50 text-pink-950',
					label: 'text-pink-700'
				},
				green: {
					base: 'border-emerald-300 bg-emerald-50 text-emerald-950',
					label: 'text-emerald-700'
				},
				indigo: {
					base: 'border-indigo-300 bg-indigo-50 text-indigo-950',
					label: 'text-indigo-700'
				},
				orange: {
					base: 'border-orange-300 bg-orange-50 text-orange-950',
					label: 'text-orange-700'
				}
			}
		},
		defaultVariants: { tone: 'none' }
	});

	type Tone = 'none' | 'blue' | 'pink' | 'green' | 'indigo' | 'orange';

	const SEX_TONE = { 牡: 'blue', 牝: 'pink', セ: 'green' } as const;
	const CENTER_TONE = { 美浦: 'indigo', 栗東: 'orange', 地方: 'none', 海外: 'none' } as const;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HorseSex, TrainingCenter } from '$lib/schemas/horse';

	/**
	 * 馬詳細の頭。名前の行（性別の札・`heading`＝h1・右端に `actions`＝推しの★）と、プロフィールの札を4行で出す。
	 *
	 * ```
	 * [牡] 馬名                                   ★
	 * [父 ○○]
	 * [母 ○○] [母父 ○○]
	 * 2021年4月4日生  [栗東] [調教師 ○○]
	 * ```
	 *
	 * 馬齢は出さない（生年月日が正。生年だけなら `2021年生`）。値の無い項目は出さず、項目が1つも無い行は描かない。
	 * 2〜4行目は左寄せで、折り返しても左から詰まる。ラベルと値の組なので行ごとに `dl` で組み、読み上げで「父 ○○」と対になるようにする。
	 * 生年月日・性別・所属は字だけで伝わるのでラベルは読み上げ専用（sr-only）。
	 * 色は上の `chip`。ラベルを `bg-muted` 上の `text-muted-foreground` にすると 4.5:1 に届かない（約 4.35:1）ので、無彩色の地は `bg-background`。
	 */
	let {
		heading,
		actions,
		sex,
		birthDate,
		birthYear,
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

	const sexItem = $derived<Item | null>(
		sex ? { key: 'sex', label: '性別', srOnly: true, value: sex, tone: SEX_TONE[sex] } : null
	);

	const centerItem = $derived<Item | null>(
		trainingCenter
			? {
					key: 'center',
					label: '所属',
					srOnly: true,
					value: trainingCenter,
					tone: CENTER_TONE[trainingCenter]
				}
			: null
	);

	const sireItems = $derived<Item[]>(
		sire ? [{ key: 'sire', label: '父', srOnly: false, value: sire, tone: 'blue' }] : []
	);

	const damItems = $derived.by(() => {
		const items: Item[] = [];
		if (dam) items.push({ key: 'dam', label: '母', srOnly: false, value: dam, tone: 'pink' });
		if (damSire) {
			items.push({ key: 'damSire', label: '母父', srOnly: false, value: damSire, tone: 'blue' });
		}
		return items;
	});

	const trainerItem = $derived<Item | null>(
		trainer
			? { key: 'trainer', label: '調教師', srOnly: false, value: trainer, tone: 'none' }
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
	<div class="flex flex-nowrap items-center gap-2">
		{#if sexItem}
			<dl class="shrink-0">{@render badge(sexItem)}</dl>
		{/if}
		{@render heading()}
		<div class="ms-auto shrink-0">{@render actions()}</div>
	</div>
	{#if sireItems.length > 0}
		<dl class="flex flex-wrap items-center gap-1.5">
			{#each sireItems as item (item.key)}{@render badge(item)}{/each}
		</dl>
	{/if}
	{#if damItems.length > 0}
		<dl class="flex flex-wrap items-center gap-1.5">
			{#each damItems as item (item.key)}{@render badge(item)}{/each}
		</dl>
	{/if}
	{#if born || centerItem || trainerItem}
		<dl class="flex flex-wrap items-center gap-1.5">
			{#if born}
				<div class="text-sm text-muted-foreground">
					<dt class="sr-only">{born.label}</dt>
					<dd>{born.text}</dd>
				</div>
			{/if}
			{#if centerItem}{@render badge(centerItem)}{/if}
			{#if trainerItem}{@render badge(trainerItem)}{/if}
		</dl>
	{/if}
</div>
