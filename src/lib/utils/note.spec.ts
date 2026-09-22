import { describe, expect, it } from 'vitest';
import { noteHeading, runHeading } from './note';

const race = {
	course: '中山',
	raceNumber: 11,
	raceName: 'オールカマー',
	grade: 'G2',
	className: null,
	finishPosition: 1
};

describe('noteHeading', () => {
	it('ふりかえりのメモには着順を出す', () => {
		expect(noteHeading({ kind: 'entry', ...race })).toEqual({
			label: '中山11R オールカマー (G2) 1着',
			kindLabel: null
		});
	});

	// 書いた時点では着順が無い。あとから結果が入って「出走前に書いたのに1着」に見えるのを防ぐ。
	it('出走前メモには着順を出さない', () => {
		expect(noteHeading({ kind: 'preview', ...race })).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '出走前'
		});
	});

	it('格が無いレースはクラスを代わりに出す', () => {
		expect(noteHeading({ ...race, kind: 'entry', grade: null, className: '1勝クラス' }).label).toBe(
			'中山11R オールカマー (1勝クラス) 1着'
		);
	});
});

/**
 * メモの無い出走の見出し。タイムラインの骨になる行で、**日付の境界**が
 * そのまま「着順を出すか」を決める（未来のレースに着順は無い）。
 */
describe('runHeading', () => {
	it('終わったレースは着順まで出す', () => {
		expect(runHeading(race, false)).toEqual({
			label: '中山11R オールカマー (G2) 1着',
			kindLabel: '出走'
		});
	});

	it('これから走るレースは着順を出さない', () => {
		expect(runHeading({ ...race, finishPosition: null }, true)).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '出走予定'
		});
	});

	// 出馬表は開催前に入るので、結果が未入力のまま日付だけ過ぎた行がありうる。
	it('着順が未入力でも、日が過ぎていれば「出走」として出す', () => {
		expect(runHeading({ ...race, finishPosition: null }, false)).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '出走'
		});
	});

	it('レース名も格も無ければ「レース」とだけ出す', () => {
		expect(runHeading({ course: null, raceNumber: null }, false).label).toBe('レース');
	});
});
