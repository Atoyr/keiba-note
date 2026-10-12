import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { listResultsFetchTargets } from './results-fetch';

let db: Db;
let sqlite: DatabaseSync;
beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO horse (id, name) VALUES ('H1', 'ホースA'), ('H2', 'ホースB');
	INSERT INTO race (id, date, course, race_number, grade, external_ref) VALUES
	('G1', '2026-10-04', '中山', 11, 'G1', 'nk-202606040911'),
	('COND', '2026-10-04', '中山', 5, NULL, NULL),
	('EMPTY', '2026-10-04', '東京', 11, 'G2', NULL),
	('NO_R', '2026-10-04', '東京', NULL, 'G2', NULL),
	('R13', '2026-10-04', '東京', 13, NULL, NULL),
	('NAR', '2026-10-04', '大井', 11, NULL, NULL),
	('YESTERDAY', '2026-10-03', '中山', 11, 'G1', NULL),
	('TOMORROW', '2026-10-05', '中山', 11, 'G1', NULL);
	INSERT INTO race_entry (id, race_id, horse_id, finish_position) VALUES
	('E1', 'G1', 'H1', 1), ('E2', 'G1', 'H2', NULL), ('E3', 'COND', 'H1', NULL),
	('E4', 'NO_R', 'H1', NULL), ('E5', 'R13', 'H1', NULL), ('E6', 'NAR', 'H1', NULL),
	('E7', 'YESTERDAY', 'H1', NULL), ('E8', 'TOMORROW', 'H1', NULL);`);
});

describe('listResultsFetchTargets', () => {
	it('当日の出走馬があるレースだけ。格・ref・一部の着順の有無は問わず、レースを重複させない', async () => {
		expect(await listResultsFetchTargets(db, new Date('2026-10-04T09:05:00Z'))).toEqual([
			{ raceId: 'COND', date: '2026-10-04', course: '中山', raceNumber: 5, externalRef: null },
			{
				raceId: 'G1',
				date: '2026-10-04',
				course: '中山',
				raceNumber: 11,
				externalRef: 'nk-202606040911'
			}
		]);
	});
	it('JRA の10場の外・レース番号が無いか1〜12の外のレースは選ばない', async () => {
		const ids = (await listResultsFetchTargets(db, new Date('2026-10-04T09:05:00Z'))).map(
			(r) => r.raceId
		);
		expect(ids).not.toContain('NAR');
		expect(ids).not.toContain('R13');
		expect(ids).not.toContain('NO_R');
	});
	it('UTC でなく JST の開催日を選ぶ', async () => {
		const ids = async (time: string) =>
			(await listResultsFetchTargets(db, new Date(time))).map((r) => r.raceId);
		expect(await ids('2026-10-04T14:59:59Z')).toEqual(['COND', 'G1']);
		expect(await ids('2026-10-04T15:00:00Z')).toEqual(['TOMORROW']);
	});
	it('出走馬が無い日には対象が無い', async () => {
		expect(await listResultsFetchTargets(db, new Date('2026-10-06T09:05:00Z'))).toEqual([]);
	});
});
