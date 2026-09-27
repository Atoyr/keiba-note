import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import JockeyTagPicker from './JockeyTagPicker.svelte';
import { JOCKEY_TAG_GROUPS, JOCKEY_TAGS } from '$lib/schemas/jockey';

const boxes = (root: HTMLElement) => [
	...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
];

describe('JockeyTagPicker', () => {
	it('札ぜんぶを同じ name のチェックボックスとして並べ、既に付いた札だけを checked にする', () => {
		const screen = render(JockeyTagPicker, { name: 'tags', values: ['中山巧者', '穴で怖い'] });

		const inputs = boxes(screen.container);
		expect(inputs.map((i) => i.value)).toEqual([...JOCKEY_TAGS]);
		expect(new Set(inputs.map((i) => i.name))).toEqual(new Set(['tags']));
		expect(inputs.filter((i) => i.checked).map((i) => i.value)).toEqual(['中山巧者', '穴で怖い']);
	});

	it('系統ごとに名前の付いたまとまりにする（読み上げで何の札かが分かる）', async () => {
		const screen = render(JockeyTagPicker, { name: 'tags' });

		for (const g of JOCKEY_TAG_GROUPS) {
			await expect.element(screen.getByRole('group', { name: g.label })).toBeInTheDocument();
		}
	});
});
