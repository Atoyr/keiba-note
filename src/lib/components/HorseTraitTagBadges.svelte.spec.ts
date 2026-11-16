import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HorseTraitTagBadges from './HorseTraitTagBadges.svelte';

const texts = (root: HTMLElement) =>
	[...root.querySelectorAll('span > span')].map((el) => el.textContent?.trim());

describe('HorseTraitTagBadges', () => {
	it('並びは渡された順ではなく HORSE_TRAIT_TAGS の順に直す', () => {
		const screen = render(HorseTraitTagBadges, {
			tags: ['中距離巧者', '右回り巧者', '東京巧者']
		});

		expect(texts(screen.container)).toEqual(['東京巧者', '右回り巧者', '中距離巧者']);
	});

	it('札が無ければ何も出さない', () => {
		const screen = render(HorseTraitTagBadges, { tags: [] });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
