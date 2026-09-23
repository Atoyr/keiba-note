import { describe, expect, it } from 'vitest';
import {
	addDays,
	currentWeek,
	formatDateShort,
	isUpcoming,
	shiftWeek,
	todayJst,
	weekLookupRange,
	weeksBefore
} from './date';

/** JST は UTC+9。UTC の 15:00 が JST の翌日 0:00。 */
const utc = (iso: string) => new Date(iso);

describe('todayJst', () => {
	it('UTC の深夜でも JST の日付を返す', () => {
		expect(todayJst(utc('2026-09-26T15:00:00Z'))).toBe('2026-09-27');
		expect(todayJst(utc('2026-09-26T14:59:00Z'))).toBe('2026-09-26');
	});
});

describe('currentWeek', () => {
	it('月曜から日曜を返す', () => {
		// 2026-09-23 は水曜
		expect(currentWeek(utc('2026-09-23T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27'
		});
	});

	it('日曜いっぱいはその週、JST で月曜になった瞬間に次の週へ切り替わる', () => {
		// 日曜 23:59 JST = まだ 9/21 週
		expect(currentWeek(utc('2026-09-27T14:59:00Z')).start).toBe('2026-09-21');
		// 月曜 00:00 JST = 次の週
		expect(currentWeek(utc('2026-09-27T15:00:00Z')).start).toBe('2026-09-28');
	});

	it('月をまたいでも壊れない', () => {
		expect(currentWeek(utc('2026-12-31T03:00:00Z'))).toEqual({
			start: '2026-12-28',
			end: '2027-01-03'
		});
	});
});

describe('currentWeek（連休）', () => {
	// 9/26(土) 9/27(日) に加えて、敬老の日のような連休で 9/28(月) にも開催がある週
	const holiday = ['2026-09-26', '2026-09-27', '2026-09-28'];

	it('月曜に開催がある週は、その月曜までが今週', () => {
		// 9/25(金)。まだ開催前だが、範囲はもう月曜まで伸びている
		expect(currentWeek(utc('2026-09-25T03:00:00Z'), holiday)).toEqual({
			start: '2026-09-21',
			end: '2026-09-28'
		});
	});

	it('連休の月曜はまだ前の週のうち（次の週へ飛ばさない）', () => {
		expect(currentWeek(utc('2026-09-28T03:00:00Z'), holiday)).toEqual({
			start: '2026-09-21',
			end: '2026-09-28'
		});
	});

	it('火曜まで開催が続けば火曜までが今週', () => {
		const silverWeek = [...holiday, '2026-09-29'];
		expect(currentWeek(utc('2026-09-29T03:00:00Z'), silverWeek)).toEqual({
			start: '2026-09-21',
			end: '2026-09-29'
		});
	});

	it('月曜に開催が無ければ火曜まで伸ばさない（土日から続いていない）', () => {
		expect(currentWeek(utc('2026-09-25T03:00:00Z'), ['2026-09-27', '2026-09-29'])).toEqual({
			start: '2026-09-21',
			end: '2026-09-27'
		});
	});

	it('延長した翌日から次の週。前の週に譲ったぶんは重ねない', () => {
		expect(currentWeek(utc('2026-09-29T03:00:00Z'), holiday)).toEqual({
			start: '2026-09-29',
			end: '2026-10-04'
		});
	});
});

describe('shiftWeek', () => {
	const holiday = ['2026-09-26', '2026-09-27', '2026-09-28'];

	it('前後の週へ動かせる', () => {
		const w = { start: '2026-09-21', end: '2026-09-27' };
		expect(shiftWeek(w, 1)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
		expect(shiftWeek(w, -1)).toEqual({ start: '2026-09-14', end: '2026-09-20' });
	});

	it('連休で伸びた週の次は、その翌日から始まる', () => {
		const w = { start: '2026-09-21', end: '2026-09-28' };
		expect(shiftWeek(w, 1, holiday)).toEqual({ start: '2026-09-29', end: '2026-10-04' });
	});

	it('そこから戻ると、伸びた週にそのまま戻る', () => {
		const w = { start: '2026-09-29', end: '2026-10-04' };
		expect(shiftWeek(w, -1, holiday)).toEqual({ start: '2026-09-21', end: '2026-09-28' });
	});
});

describe('weekLookupRange', () => {
	// 2026-09-22 は火曜。週の月曜は 9/21
	const tuesday = utc('2026-09-22T03:00:00Z');

	it('この範囲だけ読めば、全部の開催日を渡したときと同じ週になる', () => {
		// 前後に連休（月曜・火曜まで開催）を置いた並び。9/22 当日も連休の中にいる
		const dates = [
			'2026-09-13',
			'2026-09-14',
			'2026-09-19',
			'2026-09-20',
			'2026-09-21',
			'2026-09-22',
			'2026-09-26',
			'2026-09-27',
			'2026-09-28',
			'2026-09-29'
		];

		for (const offset of [-3, -1, 0, 1, 3]) {
			const { from, to } = weekLookupRange(tuesday, offset);
			const read = dates.filter((d) => d >= from && d <= to);

			const limited = shiftWeek(currentWeek(tuesday, read), offset, read);
			const everything = shiftWeek(currentWeek(tuesday, dates), offset, dates);
			expect({ offset, ...limited }).toEqual({ offset, ...everything });
		}
	});
});

describe('addDays', () => {
	it('月をまたぐ', () => {
		expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
	});

	it('閏日を跨ぐ', () => {
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});
});

describe('formatDateShort', () => {
	it('曜日つきで短く出す', () => {
		expect(formatDateShort('2026-09-27')).toBe('9/27(日)');
		expect(formatDateShort('2026-09-26')).toBe('9/26(土)');
	});
});

describe('weeksBefore', () => {
	// 9/21(月)〜9/27(日) の週。手前の3週は 8/31(月)〜9/20(日)。
	const week = { start: '2026-09-21', end: '2026-09-27' };

	it('週の頭で切る。今週ぶんは含めない', () => {
		expect(weeksBefore(week, 3)).toEqual({ from: '2026-08-31', to: '2026-09-20' });
	});

	it('連休で週の終わりが伸びていても、手前の窓は動かない', () => {
		expect(weeksBefore({ start: '2026-09-21', end: '2026-09-29' }, 3)).toEqual({
			from: '2026-08-31',
			to: '2026-09-20'
		});
	});
});

/**
 * 開催前かどうか。**ふりかえりを書かせるかどうかがここで決まる**ので、
 * 当日の扱いを取り違えると、走り終えたレースのふりかえりが書けなくなる。
 * 線引きは馬タイムラインの `[出走予定]`（`mergeHorseTimeline`）と同じ。
 */
describe('isUpcoming', () => {
	it.each([
		['2026-10-24', true],
		// 当日は「開催前」にしない。朝は開催前でも、走り終えた夕方には開催前ではない。
		['2026-10-25', false],
		['2026-10-26', false]
	])('today=%s のとき 2026-10-25 のレースは開催前か → %s', (today, upcoming) => {
		expect(isUpcoming('2026-10-25', today)).toBe(upcoming);
	});
});
