import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MarkBadge from './MarkBadge.svelte';

describe('MarkBadge', () => {
	it('☆ は記号を文字で出し、ほかの印と別の色（violet）にする', async () => {
		const screen = render(MarkBadge, { mark: '☆' });

		const badge = screen.getByTitle('予想印 ☆');
		await expect.element(badge).toHaveTextContent('☆');
		await expect.element(badge).toHaveClass(/bg-violet-100/);
	});

	// ✓ は予想の印ではなく候補のチェック。title も「予想印 ✓」ではなく「候補」にする。
	it('✓ は候補として出し、色は teal、title は「候補」', async () => {
		const screen = render(MarkBadge, { mark: '✓' });

		const badge = screen.getByTitle('候補');
		await expect.element(badge).toHaveTextContent('✓');
		await expect.element(badge).toHaveClass(/bg-teal-100/);
		expect(screen.container.querySelector('[title^="予想印"]')).toBeNull();
	});

	it('印が無ければ何も出さない', async () => {
		const screen = render(MarkBadge, { mark: null });

		expect(screen.container.querySelector('[title^="予想印"]')).toBeNull();
	});
});
