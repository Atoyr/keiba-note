import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagPicker from './TagPicker.svelte';
import { NOTE_TAGS } from '$lib/schemas/note';

const boxes = (root: HTMLElement) => [
	...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
];

/**
 * 「どの馬に何を付けたか」を開かずに見渡せることが、この部品の存在理由。
 * 見た目（選択中の塗り）と、フォームに乗る名前・値の形を押さえる。
 */
describe('TagPicker', () => {
	it('札ぜんぶを同じ name のチェックボックスとして並べる', () => {
		const screen = render(TagPicker, { name: 'tags.e1' });

		const inputs = boxes(screen.container);
		expect(inputs.map((i) => i.value)).toEqual([...NOTE_TAGS]);
		expect(new Set(inputs.map((i) => i.name))).toEqual(new Set(['tags.e1']));
	});

	it('既に付いている札だけを checked にする', () => {
		const screen = render(TagPicker, { name: 'tags.e1', values: ['不利', '好上がり'] });

		const checked = boxes(screen.container)
			.filter((i) => i.checked)
			.map((i) => i.value);
		expect(checked).toEqual(['不利', '好上がり']);
	});

	it('何も渡さなければ1つも checked にしない（＝フォームに乗らない）', () => {
		const screen = render(TagPicker, { name: 'tags.e1' });

		expect(boxes(screen.container).filter((i) => i.checked)).toEqual([]);
	});

	it('選択中の色は系統ごとに変える。結論（次走買い）だけ塗る', () => {
		const screen = render(TagPicker, { name: 'tags.e1' });

		const labelOf = (tag: string) =>
			boxes(screen.container).find((i) => i.value === tag)?.nextElementSibling?.className ?? '';

		expect(labelOf('次走買い')).toContain('peer-checked:bg-red-600');
		expect(labelOf('次走消し')).toContain('peer-checked:bg-slate-700');
		expect(labelOf('不利')).toContain('peer-checked:bg-sky-100');
		expect(labelOf('好上がり')).toContain('peer-checked:bg-amber-100');
		expect(labelOf('次走消し')).not.toContain('peer-checked:bg-red-600');
	});
});
