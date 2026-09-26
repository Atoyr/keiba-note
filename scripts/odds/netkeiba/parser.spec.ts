import { describe, expect, it } from 'vitest';
import { OddsError, validateRaceOdds } from '../../../src/lib/server/odds/odds.ts';
import { parseNetkeibaOdds } from './parser.ts';
// 2026-09-21 阪神11R（確定後）と 2026-09-27 スプリンターズS（枠順前）の実際の応答。
import result from './fixtures/result.json';
import yoso from './fixtures/yoso.json';
// 2026-09-25 21:35 の スプリンターズS（金曜発売中）の実際の応答。単勝の2番目は `0`（確定後は `0.0`）。
import middle from './fixtures/middle.json';
// 取消馬（3番）と単勝しか無い馬（5番）を入れた、発売中の形の作りもの。取消の欄の値は推測。
import middleScratched from './fixtures/middle-scratched.json';
// 発売中なのに全頭の欄が値なしの応答（作ったもの）。形が変わった疑いとして保存しない。
import middleBlank from './fixtures/middle-blank.json';

const fetchedAt = new Date('2026-09-27T05:31:00Z');

function kindOf(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (e) {
		if (e instanceof OddsError) return e.kind;
		throw e;
	}
	return undefined;
}

describe('parseNetkeibaOdds', () => {
	it('確定後の単勝と複勝の下限・上限を馬番で読む', () => {
		const odds = parseNetkeibaOdds(result, 'r1', fetchedAt);

		expect(odds.raceId).toBe('r1');
		expect(odds.horses).toHaveLength(11);
		expect(odds.horses[0]).toEqual({
			horseNumber: 1,
			winOdds: 1.4,
			placeOddsMin: 1.1,
			placeOddsMax: 1.1
		});
		expect(odds.horses[7]).toEqual({
			horseNumber: 8,
			winOdds: 113.7,
			placeOddsMin: 10.6,
			placeOddsMax: 52.3
		});
		// 読んだものは保存してよい値になっている
		expect(() => validateRaceOdds(odds)).not.toThrow();
	});

	it('発売中（middle）の実際の応答を読む', () => {
		const odds = parseNetkeibaOdds(middle, 'r1', fetchedAt);

		expect(odds.asOf).toBe('2026-09-25T12:35:25.000Z');
		expect(odds.horses).toHaveLength(16);
		expect(odds.horses.map((h) => h.horseNumber)).toEqual(
			Array.from({ length: 16 }, (_, i) => i + 1)
		);
		expect(odds.horses[0]).toEqual({
			horseNumber: 1,
			winOdds: 27.5,
			placeOddsMin: 5.8,
			placeOddsMax: 7.1
		});
		expect(odds.horses.every((h) => h.winOdds !== null && h.placeOddsMin !== null)).toBe(true);
		expect(() => validateRaceOdds(odds)).not.toThrow();
	});

	it('時点は取得元の時刻（JST）を UTC に直したもの', () => {
		const odds = parseNetkeibaOdds(result, 'r1', fetchedAt);
		expect(odds.asOf).toBe('2026-09-21T06:53:44.000Z');
		expect(odds.fetchedAt).toBe(fetchedAt.toISOString());
	});

	it('時刻が無ければ取得した時刻を時点にする', () => {
		const noTime = { ...result, data: { ...result.data, official_datetime: undefined } };
		expect(parseNetkeibaOdds(noTime, 'r1', fetchedAt).asOf).toBe(fetchedAt.toISOString());
	});

	it('取消馬と値の無い欄は null にする', () => {
		const odds = parseNetkeibaOdds(middleScratched, 'r1', fetchedAt);
		const byNumber = new Map(odds.horses.map((h) => [h.horseNumber, h]));

		expect(byNumber.get(3)).toEqual({
			horseNumber: 3,
			winOdds: null,
			placeOddsMin: null,
			placeOddsMax: null
		});
		// 単勝が 0.0 で複勝の行も無い
		expect(byNumber.get(5)).toEqual({
			horseNumber: 5,
			winOdds: null,
			placeOddsMin: null,
			placeOddsMax: null
		});
		expect(byNumber.get(1)?.winOdds).toBe(3.4);
		expect(() => validateRaceOdds(odds)).not.toThrow();
	});

	it('全頭が値なしの応答は、読めても保存してよい値にならない', () => {
		const odds = parseNetkeibaOdds(middleBlank, 'r1', fetchedAt);
		expect(odds.horses.every((h) => h.winOdds === null)).toBe(true);
		expect(kindOf(() => validateRaceOdds(odds))).toBe('invalid');
	});

	it('予想オッズ（yoso）は読まない。キーが馬番ではない', () => {
		expect(kindOf(() => parseNetkeibaOdds(yoso, 'r1', fetchedAt))).toBe('not-available');
	});

	it('NG と空の status はまだ無いものとして扱う', () => {
		expect(kindOf(() => parseNetkeibaOdds({ status: 'NG', data: '' }, 'r1', fetchedAt))).toBe(
			'not-available'
		);
		expect(kindOf(() => parseNetkeibaOdds({ status: '', data: '' }, 'r1', fetchedAt))).toBe(
			'not-available'
		);
	});

	it('limit は取得元の制限として扱う', () => {
		expect(kindOf(() => parseNetkeibaOdds({ status: 'limit' }, 'r1', fetchedAt))).toBe(
			'rate-limited'
		);
	});

	it.each([
		['JSON でない', 'not json'],
		['status が無い', { data: {} }],
		['知らない status', { status: 'new_status', data: {} }],
		['odds が無い', { status: 'middle', data: {} }],
		['単勝が無い', { status: 'middle', data: { odds: { '2': {} } } }],
		['値が配列でない', { status: 'middle', data: { odds: { '1': { '01': '3.4' } } } }],
		['馬番が数字でない', { status: 'middle', data: { odds: { '1': { a: ['3.4', '0.0'] } } } }],
		[
			'数字を含むが数でない',
			{ status: 'middle', data: { odds: { '1': { '01': ['3.4.1', ''] } } } }
		],
		['負の数', { status: 'middle', data: { odds: { '1': { '01': ['-3.4', ''] } } } }],
		['オッズが数値型', { status: 'middle', data: { odds: { '1': { '01': [3.4, ''] } } } }]
	])('想定外の形は parse で投げる: %s', (_, source) => {
		expect(kindOf(() => parseNetkeibaOdds(source, 'r1', fetchedAt))).toBe('parse');
	});
});

describe('validateRaceOdds', () => {
	const base = {
		raceId: 'r1',
		asOf: '2026-09-27T05:30:00.000Z',
		fetchedAt: '2026-09-27T05:31:00.000Z'
	};
	const horse = (over: object = {}) => ({
		horseNumber: 1,
		winOdds: 3.4,
		placeOddsMin: 1.4,
		placeOddsMax: 1.8,
		...over
	});

	it('正常な値と、値の無い馬を通す', () => {
		expect(() =>
			validateRaceOdds({
				...base,
				horses: [
					horse(),
					horse({ horseNumber: 2, winOdds: null, placeOddsMin: null, placeOddsMax: null })
				]
			})
		).not.toThrow();
	});

	it.each([
		['馬がいない', []],
		['馬番 0', [horse({ horseNumber: 0 })]],
		['馬番 19', [horse({ horseNumber: 19 })]],
		['馬番が小数', [horse({ horseNumber: 1.5 })]],
		['馬番の重複', [horse(), horse()]],
		['単勝 0', [horse({ winOdds: 0 })]],
		['単勝が負', [horse({ winOdds: -1 })]],
		['単勝が NaN', [horse({ winOdds: Number.NaN })]],
		['複勝の下限 > 上限', [horse({ placeOddsMin: 2.0, placeOddsMax: 1.5 })]],
		['複勝の片方だけ', [horse({ placeOddsMax: null })]],
		['全頭の単勝が値なし', [horse({ winOdds: null }), horse({ horseNumber: 2, winOdds: null })]]
	])('%s は invalid', (_, horses) => {
		expect(kindOf(() => validateRaceOdds({ ...base, horses }))).toBe('invalid');
	});

	it('時点が日時でなければ invalid', () => {
		expect(kindOf(() => validateRaceOdds({ ...base, asOf: 'x', horses: [horse()] }))).toBe(
			'invalid'
		);
	});
});
