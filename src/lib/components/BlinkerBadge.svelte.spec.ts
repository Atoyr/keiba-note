import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import BlinkerBadge from './BlinkerBadge.svelte';

describe('BlinkerBadge', () => {
	it('着用なら B の札を出し、読み上げは「ブリンカー着用」', async () => {
		render(BlinkerBadge, { blinker: true });
		await expect.element(page.getByText('ブリンカー着用')).toBeInTheDocument();
		await expect.element(page.getByTitle('ブリンカー着用')).toBeVisible();
		await expect.element(page.getByText('B', { exact: true })).toBeVisible();
	});

	it('着用なし・不明なら何も描かない', async () => {
		for (const blinker of [false, null]) {
			const { container } = render(BlinkerBadge, { blinker });
			expect(container.textContent?.trim()).toBe('');
		}
	});
});
