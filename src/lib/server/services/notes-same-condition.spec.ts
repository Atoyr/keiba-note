import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { listSameConditionRaceNotes } from './notes';

/**
 * 同じ条件のレースメモ。重賞のタイムラインに別に出すレースは、件数で切る前に SQL で除く。
 * 本物の SQLite で、除いたあとも件数が埋まること・名前の無いレースが落ちないことを確かめる。
 */
let state: ReturnType<typeof createTestDb>;

const condition = { course: '東京', surface: '芝', distance: 1800, before: '2026-10-01' } as const;
const ids = (notes: { raceId: string }[]) => notes.map((n) => n.raceId);

beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO race (id,date,course,name,surface,distance) VALUES
			('k25','2025-10-05','東京','毎日王冠','芝',1800),
			('k24','2024-10-06','東京','毎日王冠','芝',1800),
			('k23','2023-10-08','東京','毎日王冠','芝',1800),
			('x1','2025-05-01','東京','別のレースA','芝',1800),
			('x2','2025-04-01','東京','別のレースB','芝',1800),
			('x3','2025-03-01','東京','別のレースC','芝',1800),
			('x4','2025-02-01','東京','別のレースD','芝',1800),
			('x5','2025-01-01','東京','別のレースE','芝',1800),
			('x6','2024-12-01','東京','別のレースF','芝',1800),
			('nn','2024-11-01','東京',NULL,'芝',1800),
			('late','2026-11-01','東京','先の日付','芝',1800),
			('dirt','2025-06-01','東京','ダートの別','ダート',1800);
		INSERT INTO note (id,author_id,kind,race_id,body,occurred_at)
		SELECT 'n-' || id, 'a', 'race', id, id || ' のメモ', date FROM race;
		INSERT INTO note (id,author_id,kind,race_id,body,occurred_at)
		VALUES ('other-k22','b','race','k25','他人のメモ','2025-10-05');
	`);
});
afterEach(() => state.sqlite.close());

describe('listSameConditionRaceNotes', () => {
	it('除く名前が無ければ、同じ条件の直近から5件（新しい順）。条件の違う・先の日付のレースは出ない', async () => {
		const notes = await listSameConditionRaceNotes(state.db, condition, 'a');
		expect(ids(notes)).toEqual(['k25', 'x1', 'x2', 'x3', 'x4']);
		const empty = await listSameConditionRaceNotes(
			state.db,
			{ ...condition, excludeRaceNames: [] },
			'a'
		);
		expect(ids(empty)).toEqual(['k25', 'x1', 'x2', 'x3', 'x4']);
	});

	it('除く名前のレースは外れ、外した分は後ろのレースで5件まで埋まる', async () => {
		const notes = await listSameConditionRaceNotes(
			state.db,
			{ ...condition, excludeRaceNames: ['毎日王冠'] },
			'a'
		);
		// 毎日王冠（k25・k24・k23）が直近を占めても、除いたあとに5件ある。名前の無いレース（nn）は残る。
		expect(ids(notes)).toEqual(['x1', 'x2', 'x3', 'x4', 'x5']);
		const more = await listSameConditionRaceNotes(
			state.db,
			{ ...condition, excludeRaceNames: ['毎日王冠'] },
			'a',
			10
		);
		expect(ids(more)).toEqual(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'nn']);
	});

	it('別名も並べて除ける。他人のメモは入らない', async () => {
		const notes = await listSameConditionRaceNotes(
			state.db,
			{ ...condition, excludeRaceNames: ['毎日王冠', '別のレースA'] },
			'a'
		);
		expect(ids(notes)).toEqual(['x2', 'x3', 'x4', 'x5', 'x6']);
		const other = await listSameConditionRaceNotes(state.db, condition, 'b');
		expect(other.map((n) => n.body)).toEqual(['他人のメモ']);
		const none = await listSameConditionRaceNotes(
			state.db,
			{ ...condition, excludeRaceNames: ['毎日王冠'] },
			'b'
		);
		expect(none).toEqual([]);
	});
});
