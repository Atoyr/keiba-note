import { describe, expect, it } from 'vitest';
import { raceMeeting, raceSpec } from './race-heading';

const race = {
	date: '2026-10-04',
	course: '東京',
	raceNumber: 11,
	grade: 'G1',
	className: 'オープン',
	surface: '芝',
	distance: 1800,
	direction: '左',
	trackCondition: '良',
	weather: '晴'
};

describe('raceMeeting', () => {
	it('日付・場・R を1行目にまとめる', () => {
		expect(raceMeeting(race)).toBe('2026-10-04 東京11R');
	});
});

describe('raceSpec', () => {
	it('距離・回り・馬場状態・天気を並べる。重賞はクラスを出さない', () => {
		expect(raceSpec(race)).toEqual(['芝1800m', '左', '良', '晴']);
	});

	// 条件戦は格の札が無いので、クラスがレースの識別子になる。
	it('条件戦はクラスを先頭に出す', () => {
		expect(raceSpec({ ...race, grade: null, className: '1勝クラス' })).toEqual([
			'1勝クラス',
			'芝1800m',
			'左',
			'良',
			'晴'
		]);
	});

	// 開催前は馬場状態と天気がまだ無い。
	it('決まっていない項目は飛ばす', () => {
		expect(
			raceSpec({ ...race, distance: null, direction: null, trackCondition: null, weather: null })
		).toEqual(['芝']);
	});
});
