import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { resolveWeek } from './races';

/** JST は UTC+9。UTC の 15:00 が JST の翌日 0:00。 */
const utc = (iso: string) => new Date(iso);

/**
 * 開催日を返すだけの db。日付の絞り込みは効かせない。
 *
 * どこまで読むかは `weekLookupRange` の単体テストで見ている。
 * ここで確かめたいのは、**読んだ開催日が週の解決に渡っているか**だけ。
 */
function fakeDb(dates: string[]): Db {
	return {
		selectDistinct: () => ({
			from: () => ({
				where: () => Promise.resolve(dates.map((date) => ({ date })))
			})
		})
	} as unknown as Db;
}

// 9/26(土) 9/27(日) に加えて、連休で 9/28(月) にも開催がある週
const holiday = ['2026-09-26', '2026-09-27', '2026-09-28'];

describe('resolveWeek', () => {
	it('連休の月曜までを今週に含める', async () => {
		// 9/25(金)。開催前でも範囲はもう月曜まで伸びている
		expect(await resolveWeek(fakeDb(holiday), 0, utc('2026-09-25T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-28'
		});
	});

	it('連休の月曜に見ても、まだその週のまま', async () => {
		expect(await resolveWeek(fakeDb(holiday), 0, utc('2026-09-28T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-28'
		});
	});

	it('次の週は、連休に譲ったぶんの翌日から始まる', async () => {
		expect(await resolveWeek(fakeDb(holiday), 1, utc('2026-09-28T03:00:00Z'))).toEqual({
			start: '2026-09-29',
			end: '2026-10-04'
		});
	});

	it('開催が土日だけなら月曜〜日曜のまま', async () => {
		const weekend = ['2026-09-26', '2026-09-27'];
		expect(await resolveWeek(fakeDb(weekend), 0, utc('2026-09-25T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27'
		});
	});

	it('1件も登録が無くても月曜〜日曜を返す', async () => {
		expect(await resolveWeek(fakeDb([]), 0, utc('2026-09-25T03:00:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27'
		});
	});
});
