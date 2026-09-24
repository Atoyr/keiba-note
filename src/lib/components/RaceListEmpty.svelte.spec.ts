import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceListEmpty from './RaceListEmpty.svelte';

/**
 * 0件の文は「なぜ0件か」で変える。既定（今年の重賞）で絞ったまま0件なのに
 * 「条件に合う」と出すと、条件を付けていない人には何で絞られているのか分からない。
 */
describe('RaceListEmpty', () => {
	it('既定のまま0件なら、今年の重賞が無いことと全件へのリンクを出す', async () => {
		const screen = render(RaceListEmpty, { defaultFilter: true, filtered: true, admin: false });

		await expect.element(screen.getByText('今年の重賞はまだありません。')).toBeInTheDocument();
		await expect
			.element(screen.getByRole('link', { name: 'すべてのレースを見る →' }))
			.toHaveAttribute('href', '/races?year=');
		expect(screen.container.textContent).not.toContain('条件に合う');
		expect(screen.container.textContent).not.toContain('登録');
	});

	it('既定のまま0件なら、admin には登録の案内も出す', async () => {
		const screen = render(RaceListEmpty, { defaultFilter: true, filtered: true, admin: true });

		await expect.element(screen.getByText(/まずは1つ登録してみてください。/)).toBeInTheDocument();
	});

	it('自分で絞って0件なら「条件に合うレースがありません」', async () => {
		const screen = render(RaceListEmpty, { defaultFilter: false, filtered: true, admin: true });

		await expect.element(screen.getByText('条件に合うレースがありません。')).toBeInTheDocument();
		expect(screen.container.querySelectorAll('a').length).toBe(0);
	});

	it('全件で0件なら、まだレースが無いと出す', async () => {
		const screen = render(RaceListEmpty, { defaultFilter: false, filtered: false, admin: false });

		await expect.element(screen.getByText('まだレースがありません。')).toBeInTheDocument();
	});
});
