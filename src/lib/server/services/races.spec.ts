import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { listRaces, resolveWeek, type RaceListItem } from './races';

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

/**
 * `listRaces` の SQL は素通しで、並べ替えだけを見る db。
 *
 * 返す行は SQL の順（日付降順 → R の降順）に並べておく。**並びを作り直すのは JS 側**
 * なので、取ってきた順のまま出ていないことをここで押さえる。
 */
type Chain = {
	from: () => Chain;
	leftJoin: () => Chain;
	where: () => Chain;
	groupBy: () => Chain;
	orderBy: () => Chain;
	limit: () => Promise<RaceListItem[]>;
};

function fakeRaceDb(rows: RaceListItem[]): Db {
	const chain: Chain = {
		from: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		groupBy: () => chain,
		orderBy: () => chain,
		limit: () => Promise.resolve(rows)
	};
	return { select: () => chain } as unknown as Db;
}

const item = (date: string, raceNumber: number): RaceListItem => ({
	id: `${date}-${raceNumber}`,
	date,
	course: '東京',
	raceNumber,
	name: 'テスト',
	grade: null,
	className: null,
	surface: '芝',
	distance: 2000,
	entryCount: 0,
	noteCount: 0
});

describe('listRaces', () => {
	// 今日は 2026-09-22。未来は 10-25 と 12-27。
	const rows = [
		item('2026-12-27', 11),
		item('2026-10-25', 11),
		item('2026-10-25', 9),
		item('2026-09-20', 11),
		item('2026-09-20', 9),
		item('2026-06-14', 11)
	];

	it('次のレースが先頭。未来は近い順、そのあと過去が新しい順', async () => {
		const races = await listRaces(fakeRaceDb(rows), 'u1', '2026-09-22');

		expect(races.map((r) => r.id)).toEqual([
			'2026-10-25-9', // 次のレース（同じ日なら先に始まるほう）
			'2026-10-25-11',
			'2026-12-27-11',
			'2026-09-20-11', // 過去は最後に走った1本から
			'2026-09-20-9',
			'2026-06-14-11'
		]);
	});

	// ダッシュボードは先頭5件しか出さない。先の予定に埋もれて落ちないこと。
	it('先の予定がいくつ積まれても、次のレースは先頭5件に残る', async () => {
		const many = [
			item('2027-12-26', 11),
			item('2027-06-06', 11),
			item('2027-04-04', 11),
			item('2026-12-27', 11),
			item('2026-10-25', 11),
			item('2026-09-20', 11)
		];

		const races = await listRaces(fakeRaceDb(many), 'u1', '2026-09-22');

		expect(races.slice(0, 5).map((r) => r.id)).toContain('2026-10-25-11');
		expect(races[0].id).toBe('2026-10-25-11');
	});
});
