import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import type { RaceOdds } from '$lib/server/odds/odds';
import { getRaceOdds } from '$lib/server/services/odds';
import { pickTargets, saveOddsSql, targetsSql, type TargetRow } from './store';

/**
 * マイグレーションを流した SQLite に、本番と同じ SQL の文字列を流す。UPSERT と CHECK は本番の D1 と同じに効く。
 * 読み戻しは予想画面と同じ `getRaceOdds` で見る。
 */
let db: Db;
let sqlite: DatabaseSync;

const listOddsTargets = (now: Date) =>
	pickTargets(sqlite.prepare(targetsSql(now)).all() as TargetRow[], now);
const saveRaceOdds = (odds: RaceOdds) => sqlite.exec(saveOddsSql(odds));

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

describe('targetsSql / pickTargets', () => {
	const ids = (iso: string) => listOddsTargets(new Date(iso)).map((t) => t.raceId);

	it('当日は重賞だけ。L・OP・条件戦は ref と発走時刻があっても取りに行かない', async () => {
		// 日 14:00。R1（条件戦・15:40 発走）は対象外
		expect(listOddsTargets(new Date('2026-09-27T05:00:00Z'))).toEqual([
			{ raceId: 'G2R', externalRef: 'nk-202609040912' },
			{ raceId: 'G1R', externalRef: 'nk-202606040912' }
		]);
	});

	it('ref か発走時刻が無い重賞は取りに行かない', async () => {
		sqlite.exec(`UPDATE race SET external_ref = NULL WHERE id = 'G2R'`);
		sqlite.exec(`UPDATE race SET start_time = NULL WHERE id = 'G1R'`);
		expect(ids('2026-09-27T05:00:00Z')).toEqual([]);
	});

	it('前日の夜は G1〜G3。前々日の夜は G1 だけ', async () => {
		expect(ids('2026-09-26T10:00:00Z')).toEqual(['G2R', 'G1R']); // 土 19:00
		expect(ids('2026-09-25T10:00:00Z')).toEqual(['G1R']); // 金 19:00
		expect(ids('2026-09-25T09:00:00Z')).toEqual([]); // 金 18:00
	});

	it('日付をまたいだ深夜の回（25:00 まで）も、前の晩からの続きとして選ぶ', async () => {
		// 金 24:30（土 0:30）。「今日」は土曜になるが、日曜の G1 は金 18:30 から窓の中
		expect(ids('2026-09-25T15:30:00Z')).toEqual(['G1R']);
		// 土 25:00（日 1:00）。日曜の重賞はどちらも窓の中
		expect(ids('2026-09-26T16:00:00Z')).toEqual(['G2R', 'G1R']);
	});

	it('3日後のレースは G1 でもまだ取りに行かない', async () => {
		// 土 19:00。9/29 の G1 は前々日（9/27）の 18:30 から
		expect(ids('2026-09-26T10:00:00Z')).not.toContain('G1L');
		expect(ids('2026-09-27T10:00:00Z')).toEqual(['G1L']); // 日 19:00
	});

	it('発走後は取りに行かない', async () => {
		// 日 17:00。重賞も発走後
		expect(ids('2026-09-27T08:00:00Z')).toEqual([]);
	});
});

describe('saveOddsSql', () => {
	it('保存したものを馬番順に、時点とともに返す', async () => {
		saveRaceOdds(odds());
		expect(await getRaceOdds(db, 'R1')).toEqual({
			asOf: '2026-09-27T05:00:00.000Z',
			horses: [
				{ horseNumber: 1, winOdds: 3.4, placeOddsMin: 1.4, placeOddsMax: 1.8 },
				{ horseNumber: 2, winOdds: 8.2, placeOddsMin: 2.1, placeOddsMax: 3.0 }
			]
		});
	});

	it('同じ馬番は行を増やさず前回の値を上書きする', async () => {
		saveRaceOdds(odds());
		saveRaceOdds(
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
		saveRaceOdds(odds());
		saveRaceOdds(odds({ horses: [odds().horses[0]] }));
		expect((await getRaceOdds(db, 'R1'))?.horses.map((h) => h.horseNumber)).toEqual([1]);
	});

	it('ほかのレースの行には触らない', async () => {
		saveRaceOdds(odds({ raceId: 'R5' }));
		saveRaceOdds(odds({ horses: [odds().horses[0]] }));
		expect((await getRaceOdds(db, 'R5'))?.horses).toHaveLength(2);
	});

	it('壊れた値は DB の CHECK で落ち、前回の値がそのまま残る', async () => {
		saveRaceOdds(odds());
		expect(() =>
			saveRaceOdds(
				odds({
					asOf: '2026-09-27T05:30:00.000Z',
					horses: [
						{ horseNumber: 1, winOdds: 5.0, placeOddsMin: 1.3, placeOddsMax: 1.6 },
						{ horseNumber: 2, winOdds: 0, placeOddsMin: 1.3, placeOddsMax: 1.6 }
					]
				})
			)
		).toThrow();

		// upsert は1文なので、1番の上書きも取り消される
		expect(await getRaceOdds(db, 'R1')).toEqual({
			asOf: '2026-09-27T05:00:00.000Z',
			horses: odds().horses
		});
	});

	it('0頭は SQL にしない（全行を消さないための保険）', () => {
		expect(() => saveOddsSql(odds({ horses: [] }))).toThrow();
	});

	it("レース ID の ' は重ねて閉じる", () => {
		expect(saveOddsSql(odds({ raceId: "R'1" }))).toContain("'R''1'");
	});

	it('レースを消せばオッズも消える', async () => {
		saveRaceOdds(odds());
		sqlite.exec(`DELETE FROM race WHERE id = 'R1'`);
		expect(await getRaceOdds(db, 'R1')).toBeNull();
	});
});
