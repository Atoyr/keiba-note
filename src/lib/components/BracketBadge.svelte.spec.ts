import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BracketBadge from './BracketBadge.svelte';

describe('BracketBadge', () => {
	// 色が見えない人にも枠が読めること。色だけに意味を持たせない。
	it('色だけでなく枠番の数字も出す', async () => {
		const screen = render(BracketBadge, { bracket: 6 });

		const badge = screen.getByTitle('6枠');
		await expect.element(badge).toHaveTextContent('6');
	});

	// 枠が決まる前に名前だけで登録する運用があるので、NULL は必ず通る。
	it.each([null, 0, 9])('枠が %s のときは何も出さない', (bracket) => {
		const screen = render(BracketBadge, { bracket: bracket as number | null });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
