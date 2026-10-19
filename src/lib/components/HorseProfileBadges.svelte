<script lang="ts" module>
	const CENTER_TONE = { 美浦: 'indigo', 栗東: 'orange', 地方: 'none', 海外: 'none' } as const;
</script>

<script lang="ts">
	import type { TrainingCenter } from '$lib/schemas/horse';
	import { chip, type Tone } from '$lib/utils/horse-chip';

	/**
	 * 馬の血統と所属の札。馬詳細の頭（`HorseProfileHeader`）と、出走馬の行の馬名を押して開く枠（`HorseLink`）が同じ並びで使う。
	 *
	 * ```
	 * [父 ○○]
	 * [母 ○○] [母父 ○○]
	 * [栗東] [調教師 ○○]
	 * ```
	 *
	 * 値の無い項目は出さず、項目が1つも無い段は描かない。全部無ければ外側の要素も描かない（余白だけ残さない）。
	 * ラベルと値の組なので段ごとに `dl` で組み、読み上げで「父 ○○」と対になるようにする。所属は字だけで伝わるのでラベルは読み上げ専用（sr-only）。
	 * 色は `utils/horse-chip.ts` の `chip`。段の間隔は `gap-2`。呼ぶ側は `class` で余白などを足す。
	 */
	let {
		sire,
		dam,
		damSire,
		trainer,
		trainingCenter,
		class: className = ''
	}: {
		sire: string | null;
		dam: string | null;
		damSire: string | null;
		trainer: string | null;
		trainingCenter: TrainingCenter | null;
		class?: string;
	} = $props();

	type Item = { key: string; label: string; srOnly: boolean; value: string; tone: Tone };

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

	const hasAny = $derived(sireItems.length > 0 || damItems.length > 0 || centerItem || trainerItem);
</script>

{#snippet badge(item: Item)}
	{@const s = chip({ tone: item.tone })}
	<div class={s.base()}>
		<dt class={item.srOnly ? 'sr-only' : s.label()}>{item.label}</dt>
		<dd class={s.value()}>{item.value}</dd>
	</div>
{/snippet}

{#if hasAny}
	<div class="flex flex-col gap-2 {className}">
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
		{#if centerItem || trainerItem}
			<dl class="flex flex-wrap items-center gap-1.5">
				{#if centerItem}{@render badge(centerItem)}{/if}
				{#if trainerItem}{@render badge(trainerItem)}{/if}
			</dl>
		{/if}
	</div>
{/if}
