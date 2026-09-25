import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MarkBadge from './MarkBadge.svelte';

describe('MarkBadge', () => {
	it('☆ は記号を文字で出し、ほかの印と別の色（sky）にする', async () => {
		const screen = render(MarkBadge, { mark: '☆' });

		const badge = screen.getByTitle('予想印 ☆');
		await expect.element(badge).toHaveTextContent('☆');
		await expect.element(badge).toHaveClass(/bg-sky-100/);
	});

	it('印が無ければ何も出さない', async () => {
		const screen = render(MarkBadge, { mark: null });

		expect(screen.container.querySelector('[title^="予想印"]')).toBeNull();
	});
});
