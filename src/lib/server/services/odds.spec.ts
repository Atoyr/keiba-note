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
	// 重賞は前日（G1 は前々日）の 18:30 から取りに行く
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, grade, start_time, external_ref) VALUES
		('G1R', '2026-09-27', '中山', 12, 'G1のレース', 'G1', '15:40', 'nk-202606040912'),
		('G2R', '2026-09-27', '阪神', 12, 'G2のレース', 'G2', '15:30', 'nk-202609040912'),
		('G1L', '2026-09-29', '中山', 1, '3日後のG1', 'G1', '15:40', 'nk-202606040201')`);
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
	const ids = async (iso: string) =>
		(await listOddsTargets(db, new Date(iso))).map((t) => t.raceId);

	it('当日は、重賞と、ref・発走時刻ありで発走3時間前〜発走のレース', async () => {
		// 日 14:00。15:40 発走の R1 は窓の中、10:05 発走の R5 は発走後。重賞は前日から窓の中
		expect(await listOddsTargets(db, new Date('2026-09-27T05:00:00Z'))).toEqual([
			{ raceId: 'G2R', externalRef: 'nk-202609040912' },
			{ raceId: 'R1', externalRef: 'nk-202606040911' },
			{ raceId: 'G1R', externalRef: 'nk-202606040912' }
		]);
	});

	it('朝は朝のレースと重賞', async () => {
		// 日 08:00
		expect(await ids('2026-09-26T23:00:00Z')).toEqual(['R5', 'G2R', 'G1R']);
	});

	it('前日の夜は重賞だけ。前々日の夜は G1 だけ', async () => {
		expect(await ids('2026-09-26T10:00:00Z')).toEqual(['G2R', 'G1R']); // 土 19:00
		expect(await ids('2026-09-25T10:00:00Z')).toEqual(['G1R']); // 金 19:00
		expect(await ids('2026-09-25T09:00:00Z')).toEqual([]); // 金 18:00
	});

	it('3日後のレースは G1 でもまだ取りに行かない', async () => {
		// 土 19:00。9/29 の G1 は前々日（9/27）の 18:30 から
		expect(await ids('2026-09-26T10:00:00Z')).not.toContain('G1L');
		expect(await ids('2026-09-27T10:00:00Z')).toEqual(['G1L']); // 日 19:00
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
