import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagBadges from './TagBadges.svelte';

const texts = (root: HTMLElement) =>
	[...root.querySelectorAll('span > span')].map((el) => el.textContent?.trim());

describe('TagBadges', () => {
	it('並びは渡された順ではなく NOTE_TAGS の順に直す', () => {
		// タイムラインに何件も並ぶので、メモごとに「次走買い」の位置が動くと走査しづらい。
		const screen = render(TagBadges, { tags: ['好上がり', '次走買い', '不利'] });

		expect(texts(screen.container)).toEqual(['次走買い', '不利', '好上がり']);
	});

	it('札が無ければ何も出さない（空の枠を作らない）', () => {
		const screen = render(TagBadges, { tags: [] });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
