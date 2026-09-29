import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RacePlace from './RacePlace.svelte';
import '../../routes/layout.css';

/** 描いた「中山11R」の幅（px）と、中身がはみ出していないか。 */
const measure = (props: { course: string; raceNumber: number | null; class?: string }) => {
	const el = render(RacePlace, props).container.querySelector('span')!;
	return { width: el.getBoundingClientRect().width, fits: el.scrollWidth <= el.clientWidth };
};

/**
 * 一覧の行では、この後ろに格の札とレース名が続く。1R と 12R で幅が違うと、
 * 札の位置が行ごとに左右へずれる。
 */
describe('RacePlace', () => {
	it.each([
		['本文の字', 'text-sm'],
		['等幅（今週の重賞）', 'font-mono text-sm']
	])('1桁の R と2桁の R で幅が同じ（%s）', (_, cls) => {
		const one = measure({ course: '中山', raceNumber: 1, class: cls });
		const twelve = measure({ course: '札幌', raceNumber: 12, class: cls });

		expect(one.width).toBe(twelve.width);
		// 最小幅が足りずに「札幌12R」が押し広げていたら、上の一致は偶然でしかない。
		expect(twelve.fits).toBe(true);
	});
});
