import type { ComponentProps } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PastRunsStrip from './PastRunsStrip.svelte';

type PastRun = ComponentProps<typeof PastRunsStrip>['runs'][number];

const run = (over: Partial<PastRun>): PastRun => ({
	raceId: 'r1',
	date: '2026-09-06',
	course: '中山',
	raceNumber: 11,
	raceName: 'テスト賞',
	grade: null,
	className: '3勝クラス',
	surface: '芝',
	distance: 2000,
	trackCondition: '良',
	fieldSize: 16,
	winnerName: null,
	runnerUpName: null,
	timeDiff: null,
	bracket: null,
	horseNumber: null,
	finishPosition: 3,
	popularity: 2,
	last3f: 34.2,
	finishTime: null,
	passing: '7-7',
	jockey: 'テスト騎手',
	...over
});

describe('PastRunsStrip', () => {
	it('0走なら記録が無いことを出し、リストは出さない', () => {
		const { container } = render(PastRunsStrip, { runs: [], horseName: 'テスト馬' });

		expect(container.textContent).toContain('過去走の記録がありません。');
		expect(container.querySelector('ol')).toBeNull();
	});

	it('1走を1マスに、日付・開催場・レース名・条件・着順・人気・上り・通過・騎手で出す', () => {
		const { container } = render(PastRunsStrip, { runs: [run({})], horseName: 'テスト馬' });

		const ol = container.querySelector('ol')!;
		expect(ol.getAttribute('aria-label')).toBe('テスト馬の馬柱（直近5走）');
		const cell = ol.querySelector('li')!;
		const text = cell.textContent ?? '';
		for (const s of [
			'26/09/06',
			'中山',
			'3勝クラス',
			'テスト賞',
			'芝2000m良',
			'3/16',
			'2人',
			'34.2',
			'7-7',
			'テスト騎手'
		]) {
			expect(text).toContain(s);
		}
		// リンクは置かない（Tab の止まり場所を増やさない）
		expect(container.querySelector('a')).toBeNull();
	});

	it('1〜4走は空のマスで5マスまで埋める（空のマスは読み上げない）', () => {
		const { container } = render(PastRunsStrip, {
			runs: [run({ raceId: 'a' }), run({ raceId: 'b' })],
			horseName: 'テスト馬'
		});

		const cells = container.querySelectorAll('ol > li');
		expect(cells).toHaveLength(5);
		expect([...cells].filter((c) => c.getAttribute('aria-hidden') === 'true')).toHaveLength(3);
	});

	it('欠けた値は詰める（格があればクラスは出さず、上りも通過も無ければ段ごと出さない）', () => {
		const { container } = render(PastRunsStrip, {
			runs: [run({ grade: 'G2', last3f: null, passing: null, popularity: null, jockey: null })],
			horseName: 'テスト馬'
		});

		const text = container.querySelector('ol > li')!.textContent ?? '';
		expect(text).toContain('G2');
		expect(text).not.toContain('3勝クラス');
		expect(text).not.toContain('上り');
		expect(text).not.toContain('人');
	});
});
