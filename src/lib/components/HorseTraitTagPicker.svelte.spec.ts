import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HorseTraitTagPicker from './HorseTraitTagPicker.svelte';
import { HORSE_TRAIT_TAG_GROUPS, HORSE_TRAIT_TAGS } from '#lib/schemas/horse.ts';

const boxes = (root: HTMLElement) => [
	...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
];

describe('HorseTraitTagPicker', () => {
	it('札ぜんぶを同じ name のチェックボックスとして並べ、既に付いた札だけを checked にする', () => {
		const screen = render(HorseTraitTagPicker, {
			name: 'tags',
			values: ['東京巧者', 'マイル巧者']
		});

		const inputs = boxes(screen.container);
		expect(inputs.map((i) => i.value)).toEqual([...HORSE_TRAIT_TAGS]);
		expect(new Set(inputs.map((i) => i.name))).toEqual(new Set(['tags']));
		expect(inputs.filter((i) => i.checked).map((i) => i.value)).toEqual(['東京巧者', 'マイル巧者']);
	});

	it('系統ごとに名前の付いたまとまりにする（読み上げで何の札かが分かる）', async () => {
		const screen = render(HorseTraitTagPicker, { name: 'tags' });

		for (const g of HORSE_TRAIT_TAG_GROUPS) {
			await expect.element(screen.getByRole('group', { name: g.label })).toBeInTheDocument();
		}
	});
});
