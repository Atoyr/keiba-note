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

/** 実際の展開のコマ。`at` は順位（4角の位置か着順）。 */
const ranked = (horseNumber: number, x: number, at: number, y = 0) => ({
	...spot(horseNumber, x, y),
	at
});

const actual = {
	leadsRight: false,
	corner4: {
		spots: [ranked(2, 0, 1), ranked(1, 1, 2), ranked(3, 1, 2, 1)],
		columns: ['②', '①③']
	},
	finish: { spots: [ranked(1, 0, 1), ranked(2, 1, 2), ranked(3, 2, 3)], columns: ['①', '②', '③'] }
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

		// 既定は畳む。閉じた行には局面ごとの実際の隊列が出て、盤面は開くまで見えない。
		const summary = screen.container.querySelector('summary')!;
		expect(summary.textContent).toMatch(/4角\s*②-①③/);
		expect(summary.textContent).toMatch(/ゴール前\s*①-②-③/);
		expect(screen.container.querySelector('details')?.open).toBe(false);
		summary.click();
		await expect
			.element(screen.getByRole('group', { name: '実際の4コーナーの隊列' }))
			.toBeVisible();
		await expect.element(screen.getByRole('group', { name: '実際のゴール前の隊列' })).toBeVisible();
		expect(orders(screen.container)).toEqual([
			['4コーナー', ['②-①③']],
			['ゴール前', ['①-②-③']]
		]);
		// 結果に内外は無いので、読み上げは段の名前（内・中）ではなく順位で読む。
		await expect.element(screen.getByText('3番 馬3（4角2番手）')).toBeInTheDocument();
		await expect.element(screen.getByText('3番 馬3（3着）')).toBeInTheDocument();
		expect(screen.container.textContent).not.toMatch(/・(内|中|外|大外)）/);
		// 見出しは「内ラチ」ではなく、上下が内外でないことの注記。段は予想の盤面と同じ4段。
		expect(screen.container.textContent).not.toContain('内ラチ');
		expect(screen.getByText('上下は内外ではない').elements()).toHaveLength(2);
		const grids = screen.container.querySelectorAll('.grid-cols-10');
		expect([...grids].map((g) => g.children.length)).toEqual([40, 40]);
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
