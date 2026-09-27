import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import JockeyTagBadges from './JockeyTagBadges.svelte';

const texts = (root: HTMLElement) =>
	[...root.querySelectorAll('span > span')].map((el) => el.textContent?.trim());

describe('JockeyTagBadges', () => {
	it('並びは渡された順ではなく JOCKEY_TAGS の順に直す', () => {
		const screen = render(JockeyTagBadges, { tags: ['穴で怖い', '芝巧者', '中山巧者'] });

		expect(texts(screen.container)).toEqual(['中山巧者', '芝巧者', '穴で怖い']);
	});

	it('札が無ければ何も出さない', () => {
		const screen = render(JockeyTagBadges, { tags: [] });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
