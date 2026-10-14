import { describe, expect, it } from 'vitest';
import { raceGoing, raceMeeting, raceSpec } from './race-heading';

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
	// 日付は2行目。1行目は場・R とレース名だけにする。
	it('場と R を1行目にまとめる。日付は入れない', () => {
		expect(raceMeeting(race)).toBe('東京11R');
	});
});

describe('raceSpec', () => {
	it('日付のあとに距離・回りを並べる。重賞はクラスを出さない。馬場状態・天候は入れない', () => {
		expect(raceSpec(race)).toBe('2026-10-04 · 芝1800m / 左');
	});

	// 条件戦は格の札が無いので、クラスがレースの識別子になる。
	it('条件戦はクラスを条件の先頭に出す', () => {
		expect(raceSpec({ ...race, grade: null, className: '1勝クラス' })).toBe(
			'2026-10-04 · 1勝クラス / 芝1800m / 左'
		);
	});

	it('画面ごとに足すもの（頭数）は条件の末尾に付く', () => {
		expect(raceSpec(race, ['16頭'])).toBe('2026-10-04 · 芝1800m / 左 / 16頭');
	});

	it('決まっていない項目は飛ばし、条件が1つも無ければ日付だけ', () => {
		expect(
			raceSpec({ ...race, distance: null, direction: null, trackCondition: null, weather: null })
		).toBe('2026-10-04 · 芝');
		expect(
			raceSpec({ ...race, surface: null, direction: null, trackCondition: null, weather: null })
		).toBe('2026-10-04');
	});
});

describe('raceGoing', () => {
	it('馬場と天候を「馬場：良 / 天候：晴」の形で並べる', () => {
		expect(raceGoing(race)).toBe('馬場：良 / 天候：晴');
	});

	it('片方だけあればその片方だけ出す', () => {
		expect(raceGoing({ ...race, weather: null })).toBe('馬場：良');
		expect(raceGoing({ ...race, trackCondition: null })).toBe('天候：晴');
	});

	it('どちらも無ければ空文字', () => {
		expect(raceGoing({ ...race, trackCondition: null, weather: null })).toBe('');
	});
});
