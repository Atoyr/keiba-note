<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * 札の色（依頼による。2026-10-06）。性別でそろえ、牡と父を青・牝と母をピンク・セ馬を緑、
	 * 所属は美浦を紺・栗東を橙にする。性が無い馬齢だけ・地方・海外・所属不明の調教師は無彩色。
	 * 色だけに頼らず、札の中に `牡`・`父`・`栗東` などの字を必ず出す。
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
	import type { TrainingCenter } from '$lib/schemas/horse';

	/**
	 * 馬のプロフィールの札。並びは 性齢 → 父 → 母 → 調教師（所属）で、値の無い項目は出さない（全部無ければ何も描かない）。
	 * 性齢は `牡4`（馬齢は `currentYear - birthYear`）。性だけなら `牡`、馬齢だけなら `4歳`。
	 * ラベルと値の組なので `dl` で組み、読み上げで「父 ○○」と対になるようにする。性齢は札の字だけで伝わるので
	 * ラベルは読み上げ専用（sr-only）。
	 * 調教師は所属が分かればラベルを所属にする（`栗東 ○○`）。調教師が無く所属だけなら `栗東` だけの札。
	 * 色は上の `chip`。ラベルを `bg-muted` 上の `text-muted-foreground` にすると 4.5:1 に届かない（約 4.35:1）ので、無彩色の地は `bg-background`。
	 */
	let {
		sex,
		birthYear,
		currentYear,
		sire,
		dam,
		trainer,
		trainingCenter,
		class: className = ''
	}: {
		sex: '牡' | '牝' | 'セ' | null;
		birthYear: number | null;
		currentYear: number;
		sire: string | null;
		dam: string | null;
		trainer: string | null;
		trainingCenter: TrainingCenter | null;
		class?: string;
	} = $props();

	const sexAge = $derived.by(() => {
		const age = birthYear ? currentYear - birthYear : null;
		if (sex && age !== null) return `${sex}${age}`;
		if (sex) return sex;
		if (age !== null) return `${age}歳`;
		return null;
	});

	type Item = { key: string; label: string; srOnly: boolean; value: string; tone: Tone };

	const labelled = $derived.by(() => {
		const items: Item[] = [];
		if (sire) items.push({ key: 'sire', label: '父', srOnly: false, value: sire, tone: 'blue' });
		if (dam) items.push({ key: 'dam', label: '母', srOnly: false, value: dam, tone: 'pink' });
		if (trainer) {
			items.push(
				trainingCenter
					? {
							key: 'trainer',
							label: trainingCenter,
							srOnly: false,
							value: trainer,
							tone: CENTER_TONE[trainingCenter]
						}
					: { key: 'trainer', label: '調教師', srOnly: false, value: trainer, tone: 'none' }
			);
		} else if (trainingCenter) {
			items.push({
				key: 'center',
				label: '所属',
				srOnly: true,
				value: trainingCenter,
				tone: CENTER_TONE[trainingCenter]
			});
		}
		return items;
	});

	const sexAgeTone = $derived<Tone>(sex ? SEX_TONE[sex] : 'none');
</script>

{#if sexAge || labelled.length > 0}
	<dl class="flex flex-wrap items-center gap-1.5 {className}">
		{#if sexAge}
			{@const s = chip({ tone: sexAgeTone })}
			<div class={s.base()}>
				<dt class="sr-only">性齢</dt>
				<dd class={s.value()}>{sexAge}</dd>
			</div>
		{/if}
		{#each labelled as item (item.key)}
			{@const s = chip({ tone: item.tone })}
			<div class={s.base()}>
				<dt class={item.srOnly ? 'sr-only' : s.label()}>{item.label}</dt>
				<dd class={s.value()}>{item.value}</dd>
			</div>
		{/each}
	</dl>
{/if}
