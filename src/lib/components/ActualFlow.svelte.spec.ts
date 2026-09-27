import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ActualFlow from './ActualFlow.svelte';
import type { ResolvedFlow } from '$lib/utils/race-flow';

const actual = { corner4: ['②', '①③', '④'], finish: ['①', '②', '③', '④'] };

const spot = (horseNumber: number, x: number) => ({
	horseNumber,
	bracket: horseNumber,
	horseName: `馬${horseNumber}`,
	x,
	y: 0
});

const predicted: ResolvedFlow = {
	pace: 'スロー',
	leadsRight: false,
	start: { spots: [], memo: '' },
	corner4: { spots: [spot(1, 0), spot(2, 1)], memo: '' },
	finish: { spots: [], memo: '' }
};

/** 局面（dt）ごとの中身（dd）の文字。 */
const rows = (root: HTMLElement) =>
	[...root.querySelectorAll('dt')].map((dt) => [
		dt.textContent?.trim(),
		dt.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim()
	]);

describe('ActualFlow', () => {
	it('予想が無ければ、4角とゴール前の実際の隊列だけを札なしで出す', () => {
		const screen = render(ActualFlow, { actual });

		expect(rows(screen.container)).toEqual([
			['4角', '②-①③-④'],
			['ゴール前', '①-②-③-④']
		]);
	});

	it('予想を置いていたら、置いた局面だけ予想の隊列を下に並べ、「実際」「予想」の札を付ける', () => {
		const screen = render(ActualFlow, { actual, predicted });

		expect(rows(screen.container)).toEqual([
			['4角', '実際②-①③-④ 予想①-②'],
			['ゴール前', '実際①-②-③-④']
		]);
	});

	it('4角が出せないレース（直線など）はゴール前だけ', () => {
		const screen = render(ActualFlow, { actual: { corner4: null, finish: ['①', '②'] } });

		expect(rows(screen.container)).toEqual([['ゴール前', '①-②']]);
	});
});
