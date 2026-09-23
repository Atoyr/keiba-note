import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagPicker from './TagPicker.svelte';
import { NOTE_TAGS } from '$lib/schemas/note';

const boxes = (root: HTMLElement) => [
	...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
];

const checked = (root: HTMLElement) =>
	boxes(root)
		.filter((i) => i.checked)
		.map((i) => i.value);

/**
 * フォームに乗る名前・値の形を押さえる。受け側は `form.getAll(name)` で読むので、
 * name がずれたり値が札の文字列でなくなると、付けた札が黙って保存されなくなる。
 */
describe('TagPicker', () => {
	it('札ぜんぶを同じ name のチェックボックスとして並べる', () => {
		const screen = render(TagPicker, { name: 'tags.e1' });

		const inputs = boxes(screen.container);
		expect(inputs.map((i) => i.value)).toEqual([...NOTE_TAGS]);
		expect(new Set(inputs.map((i) => i.name))).toEqual(new Set(['tags.e1']));
	});

	it('既に付いている札だけを checked にする（何も渡さなければ1つも付けない）', () => {
		const withValues = render(TagPicker, { name: 'tags.e1', values: ['不利', '好上がり'] });
		expect(checked(withValues.container)).toEqual(['不利', '好上がり']);

		const empty = render(TagPicker, { name: 'tags.e2' });
		expect(checked(empty.container)).toEqual([]);
	});
});
