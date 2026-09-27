import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ActualFlow from './ActualFlow.svelte';
import type { ResolvedFlow } from '$lib/utils/race-flow';

const spot = (horseNumber: number, x: number, y = 0) => ({
	horseNumber,
	bracket: horseNumber,
	horseName: `馬${horseNumber}`,
	x,
	y
});

const actual = {
	leadsRight: false,
	corner4: { spots: [spot(2, 0), spot(1, 1), spot(3, 1, 1)], columns: ['②', '①③'] },
	finish: { spots: [spot(1, 0), spot(2, 1), spot(3, 2)], columns: ['①', '②', '③'] }
};

const predicted: ResolvedFlow = {
	pace: 'スロー',
	leadsRight: false,
	start: { spots: [], memo: '' },
	corner4: { spots: [spot(1, 0), spot(2, 1)], memo: '' },
	finish: { spots: [], memo: '' }
};

/** 局面ごとの盤面の下の文字（隊列の1行）。 */
const orders = (root: HTMLElement) =>
	[...root.querySelectorAll('h3')].map((h) => [
		h.textContent?.trim(),
		[...(h.parentElement?.querySelectorAll('p') ?? [])].map((p) =>
			p.textContent?.replace(/\s+/g, '').trim()
		)
	]);

describe('ActualFlow', () => {
	it('予想が無ければ、4コーナーとゴール前の盤面と隊列の1行を札なしで出す', async () => {
		const screen = render(ActualFlow, { actual });

		await expect
			.element(screen.getByRole('group', { name: '実際の4コーナーの隊列' }))
			.toBeVisible();
		await expect.element(screen.getByRole('group', { name: '実際のゴール前の隊列' })).toBeVisible();
		expect(orders(screen.container)).toEqual([
			['4コーナー', ['②-①③']],
			['ゴール前', ['①-②-③']]
		]);
		// 盤面のコマは読み上げで場所ごとに読める（同じマスに積んだ2段目も）。
		await expect.element(screen.getByText('3番 馬3（前から2列目・中）')).toBeInTheDocument();
	});

	it('予想を置いていたら、置いた局面だけ予想の隊列を下に並べ、「実際」「予想」の札を付ける', () => {
		const screen = render(ActualFlow, { actual, predicted });

		expect(orders(screen.container)).toEqual([
			['4コーナー', ['実際②-①③', '予想①-②']],
			['ゴール前', ['実際①-②-③']]
		]);
	});

	it('4角が出せないレース（直線など）はゴール前の盤面だけ', () => {
		const screen = render(ActualFlow, { actual: { ...actual, corner4: null } });

		expect(screen.container.querySelectorAll('[role="group"]')).toHaveLength(1);
		expect(orders(screen.container)).toEqual([['ゴール前', ['①-②-③']]]);
	});
});
