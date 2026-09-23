import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceFilterForm from './RaceFilterForm.svelte';
import { EMPTY_RACE_FILTER, type RaceFilter } from '$lib/utils/race-filter';

const years = [2026, 2025];

const setup = (filter: Partial<RaceFilter> = {}) =>
	render(RaceFilterForm, { filter: { ...EMPTY_RACE_FILTER, ...filter }, years });

/**
 * 絞り込んだ状態でページが返ってきたとき、**フォームが同じ条件を映していること**を見る。
 * ここがずれると「絞った条件が分からないまま結果だけ減っている」画面になる。
 */
describe('RaceFilterForm', () => {
	it('絞り込んでいなければ年度は「すべて」、チェックは無し', async () => {
		const screen = setup();

		await expect.element(screen.getByLabelText('年度')).toHaveValue('');
		for (const grade of ['G1', 'G2', 'G3', 'L', 'OP']) {
			await expect.element(screen.getByRole('checkbox', { name: grade })).not.toBeChecked();
		}
		await expect.element(screen.getByLabelText('レース名')).toHaveValue('');
	});

	it('選んだ年度・ランク・レース名がフォームに残る', async () => {
		const screen = setup({ year: 2025, grades: ['G1', 'G3'], q: '記念' });

		await expect.element(screen.getByLabelText('年度')).toHaveValue('2025');
		await expect.element(screen.getByRole('checkbox', { name: 'G1' })).toBeChecked();
		await expect.element(screen.getByRole('checkbox', { name: 'G3' })).toBeChecked();
		await expect.element(screen.getByRole('checkbox', { name: 'G2' })).not.toBeChecked();
		await expect.element(screen.getByLabelText('レース名')).toHaveValue('記念');
	});

	it('絞り込んでいるときだけクリアを出す', async () => {
		await expect
			.element(setup({ q: '記念' }).getByRole('link', { name: '条件をクリア' }))
			.toBeInTheDocument();
		expect(setup().container.querySelectorAll('a').length).toBe(0);
	});
});
