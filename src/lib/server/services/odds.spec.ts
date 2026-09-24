import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import type { RaceOdds } from '$lib/server/odds/odds';
import { getRaceOdds, listOddsTargets, saveRaceOdds } from './odds';

/** マイグレーションを流した SQLite に実際に書く。UPSERT と CHECK は本番の D1 と同じに効く。 */
let db: Db;
let sqlite: DatabaseSync;

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, start_time, external_ref) VALUES
		('R1', '2026-09-27', '中山', 11, 'スプリンターズS', '15:40', 'nk-202606040911'),
		('R2', '2026-09-27', '阪神', 11, 'ref なし', '15:30', NULL),
		('R3', '2026-09-27', '阪神', 10, '発走時刻なし', NULL, 'nk-202609040910'),
		('R4', '2026-09-28', '中山', 11, '翌日', '15:40', 'nk-202606040111'),
		('R5', '2026-09-27', '中山', 9, '朝のレース', '10:05', 'nk-202606040909')`);
});

const odds = (over: Partial<RaceOdds> = {}): RaceOdds => ({
	raceId: 'R1',
	asOf: '2026-09-27T05:00:00.000Z',
	fetchedAt: '2026-09-27T05:00:30.000Z',
	horses: [
		{ horseNumber: 1, winOdds: 3.4, placeOddsMin: 1.4, placeOddsMax: 1.8 },
		{ horseNumber: 2, winOdds: 8.2, placeOddsMin: 2.1, placeOddsMax: 3.0 }
	],
	...over
});

describe('listOddsTargets', () => {
	it('当日・ref あり・発走時刻ありで、発走3時間前〜発走のレースだけ', async () => {
		// JST 14:00。15:40 発走の R1 は窓の中、10:05 発走の R5 は発走後
		expect(await listOddsTargets(db, new Date('2026-09-27T05:00:00Z'))).toEqual([
			{ raceId: 'R1', externalRef: 'nk-202606040911' }
		]);
	});

	it('朝は朝のレースだけ', async () => {
		// JST 08:00
		expect(await listOddsTargets(db, new Date('2026-09-26T23:00:00Z'))).toEqual([
			{ raceId: 'R5', externalRef: 'nk-202606040909' }
		]);
	});

	it('対象が無い時間は空', async () => {
		// JST 17:00。全レース発走後
		expect(await listOddsTargets(db, new Date('2026-09-27T08:00:00Z'))).toEqual([]);
	});
});

describe('saveRaceOdds / getRaceOdds', () => {
	it('まだ1度も取れていなければ null', async () => {
		expect(await getRaceOdds(db, 'R1')).toBeNull();
	});

	it('保存したものを馬番順に、時点とともに返す', async () => {
		await saveRaceOdds(db, odds());
		expect(await getRaceOdds(db, 'R1')).toEqual({
			asOf: '2026-09-27T05:00:00.000Z',
			horses: [
				{ horseNumber: 1, winOdds: 3.4, placeOddsMin: 1.4, placeOddsMax: 1.8 },
				{ horseNumber: 2, winOdds: 8.2, placeOddsMin: 2.1, placeOddsMax: 3.0 }
			]
		});
	});

	it('同じ馬番は行を増やさず前回の値を上書きする', async () => {
		await saveRaceOdds(db, odds());
		await saveRaceOdds(
			db,
			odds({
				asOf: '2026-09-27T05:30:00.000Z',
				horses: [
					{ horseNumber: 1, winOdds: 2.9, placeOddsMin: 1.3, placeOddsMax: 1.6 },
					{ horseNumber: 2, winOdds: null, placeOddsMin: null, placeOddsMax: null }
				]
			})
		);

		const stored = await getRaceOdds(db, 'R1');
		expect(stored?.asOf).toBe('2026-09-27T05:30:00.000Z');
		expect(stored?.horses).toEqual([
			{ horseNumber: 1, winOdds: 2.9, placeOddsMin: 1.3, placeOddsMax: 1.6 },
			{ horseNumber: 2, winOdds: null, placeOddsMin: null, placeOddsMax: null }
		]);
		expect(sqlite.prepare('SELECT count(*) AS n FROM race_odds').get()).toEqual({ n: 2 });
	});

	it('今回の応答に無い馬番の行は消す', async () => {
		await saveRaceOdds(db, odds());
		await saveRaceOdds(db, odds({ horses: [odds().horses[0]] }));
		expect((await getRaceOdds(db, 'R1'))?.horses.map((h) => h.horseNumber)).toEqual([1]);
	});

	it('ほかのレースの行には触らない', async () => {
		await saveRaceOdds(db, odds({ raceId: 'R5' }));
		await saveRaceOdds(db, odds({ horses: [odds().horses[0]] }));
		expect((await getRaceOdds(db, 'R5'))?.horses).toHaveLength(2);
	});

	it('壊れた値は DB の CHECK で落ち、前回の値がそのまま残る', async () => {
		await saveRaceOdds(db, odds());
		await expect(
			saveRaceOdds(
				db,
				odds({
					asOf: '2026-09-27T05:30:00.000Z',
					horses: [
						{ horseNumber: 1, winOdds: 5.0, placeOddsMin: 1.3, placeOddsMax: 1.6 },
						{ horseNumber: 2, winOdds: 0, placeOddsMin: 1.3, placeOddsMax: 1.6 }
					]
				})
			)
		).rejects.toThrow();

		// batch は1トランザクション。1番の上書きも取り消される
		expect(await getRaceOdds(db, 'R1')).toEqual({
			asOf: '2026-09-27T05:00:00.000Z',
			horses: odds().horses
		});
	});

	it('レースを消せばオッズも消える', async () => {
		await saveRaceOdds(db, odds());
		sqlite.exec(`DELETE FROM race WHERE id = 'R1'`);
		expect(await getRaceOdds(db, 'R1')).toBeNull();
	});
});
