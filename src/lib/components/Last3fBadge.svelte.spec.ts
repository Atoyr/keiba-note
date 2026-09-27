import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Last3fBadge from './Last3fBadge.svelte';

describe('Last3fBadge', () => {
	it.each([
		[1, /bg-yellow-200/],
		[2, /bg-sky-200/],
		[3, /bg-orange-200/]
	])('上り%i位は順位を文字でも出し、順位ごとの色にする', async (rank, tone) => {
		const screen = render(Last3fBadge, { last3f: 33.9, rank });

		const badge = screen.getByTitle(`上り${rank}位`);
		await expect.element(badge).toHaveTextContent(`上り${rank}位 33.9`);
		await expect.element(badge).toHaveClass(tone);
	});

	it('4位以下は順位も色も付けない', async () => {
		const screen = render(Last3fBadge, { last3f: 35, rank: 4 });

		await expect.element(screen.getByText('上り35.0')).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('位');
	});

	it('上りが無ければ何も出さない', async () => {
		const screen = render(Last3fBadge, { last3f: null, rank: null });

		expect(screen.container.textContent?.trim()).toBe('');
	});
});
