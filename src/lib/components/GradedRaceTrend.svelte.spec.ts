import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GradedRaceTrend from './GradedRaceTrend.svelte';
import '../../routes/layout.css';

describe('GradedRaceTrend', () => {
	it('見出しに「重賞の傾向」と鍵・毎年共通が出る', async () => {
		const screen = render(GradedRaceTrend, { raceKey: '毎日王冠', body: '前哨戦。' });

		const region = screen.getByRole('region', { name: /重賞の傾向/ });
		await expect.element(region).toBeVisible();
		await expect.element(region).toHaveTextContent('毎日王冠・毎年共通');
	});

	it('本文の改行を保って出す', async () => {
		const body = '一行目。\n二行目。';
		const screen = render(GradedRaceTrend, { raceKey: '毎日王冠', body });

		const p = screen.container.querySelector('p')!;
		expect(p.textContent).toBe(body);
		expect(getComputedStyle(p).whiteSpace).toBe('pre-wrap');
	});

	it('リンクは重賞の画面（鍵をエンコード）へ向く', async () => {
		const screen = render(GradedRaceTrend, { raceKey: '毎日王冠', body: '前哨戦。' });

		await expect
			.element(screen.getByRole('link', { name: '重賞の画面で直す' }))
			.toHaveAttribute('href', `/graded-races/${encodeURIComponent('毎日王冠')}`);
	});
});
