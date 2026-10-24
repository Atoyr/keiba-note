import { describe, expect, it } from 'vitest';
import { cond, finish, post, rival, title, tone, ymd, type PastRun } from './past-runs';

const run = (over: Partial<PastRun> = {}): PastRun => ({
	raceId: 'r1',
	date: '2026-09-06',
	course: '中山',
	raceNumber: 11,
	raceName: null,
	grade: null,
	className: null,
	surface: '芝',
	distance: 2000,
	trackCondition: '良',
	fieldSize: 16,
	winnerName: '勝ち馬',
	runnerUpName: '2着馬',
	timeDiff: 0.4,
	bracket: 3,
	horseNumber: 5,
	finishPosition: 3,
	popularity: 2,
	last3f: 34.2,
	finishTime: null,
	passing: null,
	jockey: null,
	...over
});

describe('past-runs の書式', () => {
	it('日付は年を2桁で残す', () => {
		expect(ymd('2026-09-06')).toBe('26/09/06');
	});

	it('枠-馬番は片方だけなら単位を付け、どちらも無ければ —', () => {
		expect(post(run())).toBe('3-5');
		expect(post(run({ horseNumber: null }))).toBe('3枠');
		expect(post(run({ bracket: null }))).toBe('5番');
		expect(post(run({ bracket: null, horseNumber: null }))).toBe('—');
	});

	it('着順/頭数は欠けた側を詰める', () => {
		expect(finish(run())).toBe('3/16');
		expect(finish(run({ fieldSize: null }))).toBe('3着');
		expect(finish(run({ finishPosition: null }))).toBe('—/16');
		expect(finish(run({ finishPosition: null, fieldSize: null }))).toBe('—');
	});

	it('レース名が無ければ 開催場+番号R', () => {
		expect(title(run())).toBe('中山11R');
		expect(title(run({ raceName: '札幌記念' }))).toBe('札幌記念');
	});

	it('条件は欠けた要素を詰める', () => {
		expect(cond(run())).toBe('芝2000m良');
		expect(cond(run({ surface: null, distance: null }))).toBe('良');
	});

	it('比べる相手は、負けたら勝ち馬・勝ったら2着馬・着順が無ければ無し', () => {
		expect(rival(run())).toEqual({ label: '勝ち馬', text: '勝ち馬（0.4）' });
		expect(rival(run({ finishPosition: 1, timeDiff: -0.2 }))).toEqual({
			label: '2着馬',
			text: '2着馬（-0.2）'
		});
		expect(rival(run({ finishPosition: null }))).toBeNull();
		expect(rival(run({ winnerName: null, timeDiff: null }))).toBeNull();
	});

	it('着順の強調は1着が赤・掲示板が太め・着順なしは薄い', () => {
		expect(tone(1)).toContain('text-red-700');
		expect(tone(5)).toBe('font-medium');
		expect(tone(6)).toBe('');
		expect(tone(null)).toBe('text-muted-foreground');
	});
});
