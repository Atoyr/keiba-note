import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { entriesFetchBlocker, listEntriesFetchTargets, listUpcomingRaces } from './entries-fetch';

let db: Db;
let sqlite: DatabaseSync;

// 2026-09-24（木）12:00 JST。スプリンターズS（日曜）の3日前。
const NOW = new Date('2026-09-24T03:00:00Z');

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO horse (id, name) VALUES ('H1', 'ホースA'), ('H2', 'ホースB')`);
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, grade, external_ref) VALUES
		('SPR', '2026-09-27', '中山', 11, 'スプリンターズS', 'G1', 'nk-202606040911'),
		('SAT', '2026-09-26', '阪神', 11, '土曜の重賞', 'G2', NULL),
		('DONE', '2026-09-26', '中山', 11, '枠順が入った重賞', 'G3', NULL),
		('OP', '2026-09-27', '阪神', 11, 'オープン', 'OP', NULL),
		('FAR', '2026-09-28', '中山', 11, '4日後の重賞', 'G1', NULL),
		('TODAY', '2026-09-24', '中山', 11, '当日の重賞', 'G1', NULL),
		('NORACE', '2026-09-27', '中山', NULL, 'R が無い重賞', 'G1', NULL)`);
	sqlite.exec(`INSERT INTO race_entry (id, race_id, horse_id, horse_number) VALUES
		('E1', 'SPR', 'H1', NULL),
		('E2', 'SPR', 'H2', NULL),
		('E3', 'DONE', 'H1', 1),
		('E4', 'DONE', 'H2', NULL)`);
});

describe('listEntriesFetchTargets', () => {
	it('1〜3日後の重賞のうち、馬番がまだ1頭も無いものを開催順に返す', async () => {
		expect(await listEntriesFetchTargets(db, NOW)).toEqual([
			{
				raceId: 'SAT',
				date: '2026-09-26',
				course: '阪神',
				raceNumber: 11,
				externalRef: null
			},
			{
				raceId: 'SPR',
				date: '2026-09-27',
				course: '中山',
				raceNumber: 11,
				externalRef: 'nk-202606040911'
			}
		]);
	});

	it('枠順の PR が入って馬番が付いたら外れる', async () => {
		sqlite.exec(`UPDATE race_entry SET horse_number = 3 WHERE id = 'E1'`);
		const ids = (await listEntriesFetchTargets(db, NOW)).map((t) => t.raceId);
		expect(ids).toEqual(['SAT']);
	});
});

describe('entriesFetchBlocker', () => {
	const WEEK_END = '2026-09-27';

	it('race_id があれば来週以降でも引ける', () => {
		expect(
			entriesFetchBlocker(
				{ date: '2026-10-04', raceNumber: 11, externalRef: 'nk-202605040111' },
				WEEK_END
			)
		).toBeNull();
	});

	it('race_id が無ければ当週（週の終わりまで）だけ', () => {
		const r = { raceNumber: 11, externalRef: null };
		expect(entriesFetchBlocker({ ...r, date: '2026-09-27' }, WEEK_END)).toBeNull();
		expect(entriesFetchBlocker({ ...r, date: '2026-10-03' }, WEEK_END)).toMatch(/当週/);
	});

	it('レース番号が無ければ引けない', () => {
		expect(
			entriesFetchBlocker(
				{ date: '2026-09-27', raceNumber: null, externalRef: 'nk-202606040911' },
				WEEK_END
			)
		).toMatch(/レース番号/);
	});
});

describe('listUpcomingRaces', () => {
	it('期間内のレースを格を問わず並べ、出走馬と馬番の頭数を添える', async () => {
		const races = await listUpcomingRaces(db, { from: '2026-09-26', to: '2026-09-27' });
		expect(races.map((r) => [r.id, r.entryCount, r.numberedCount])).toEqual([
			['DONE', 2, 1],
			['SAT', 0, 0],
			['NORACE', 0, 0],
			['SPR', 2, 0],
			['OP', 0, 0]
		]);
	});
});
