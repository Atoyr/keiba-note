import { describe, expect, it } from 'vitest';
import {
	GRADED_RACE_ALIAS_ROWS,
	gradedRaceKey,
	gradedRaceNames,
	gradedRaceParam,
	isGraded
} from './graded-race';

describe('gradedRaceKey', () => {
	it('別名を鍵に寄せる', () => {
		expect(gradedRaceKey('産経賞オールカマー')).toBe('オールカマー');
		expect(gradedRaceKey('マイルチャンピオンS')).toBe('マイルチャンピオンシップ');
		expect(gradedRaceKey('ローズS')).toBe('ローズステークス');
	});

	it('鍵はそのまま鍵', () => {
		expect(gradedRaceKey('オールカマー')).toBe('オールカマー');
	});

	it('表に無い名前はそのまま返す', () => {
		expect(gradedRaceKey('有馬記念')).toBe('有馬記念');
	});

	it('前後の空白を除く', () => {
		expect(gradedRaceKey('  産経賞オールカマー ')).toBe('オールカマー');
		expect(gradedRaceKey(' 有馬記念 ')).toBe('有馬記念');
	});
});

describe('gradedRaceNames', () => {
	it('鍵と別名すべてを返す', () => {
		expect(gradedRaceNames('ローズステークス')).toEqual([
			'ローズステークス',
			'関西TVローズS',
			'ローズS'
		]);
	});

	it('表に無い鍵は自分だけ', () => {
		expect(gradedRaceNames('有馬記念')).toEqual(['有馬記念']);
	});
});

describe('別名の表', () => {
	it('同じ名前が2つの行に出ない', () => {
		const all = GRADED_RACE_ALIAS_ROWS.flat();
		expect(new Set(all).size).toBe(all.length);
	});
});

describe('gradedRaceParam', () => {
	it('URL に入れられる形にエンコードする', () => {
		expect(gradedRaceParam('A/B?')).toBe('A%2FB%3F');
	});
});

describe('isGraded', () => {
	it('G1〜G3 だけ', () => {
		expect(['G1', 'G2', 'G3'].every(isGraded)).toBe(true);
		expect(isGraded('L')).toBe(false);
		expect(isGraded('OP')).toBe(false);
		expect(isGraded(null)).toBe(false);
	});
});
