import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '$lib/server/db/test-d1';
import type { Db } from '$lib/server/db';
import { getRaceForPreview, listPastRuns } from './races';
import { listRaceNoteContext } from './notes';

let db: Db;
let sqlite: DatabaseSync;
beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO user (id, google_sub, email, display_name) VALUES
		('me', 'me', 'me@example.test', '本人'), ('other', 'other', 'other@example.test', '他人');
		INSERT INTO horse (id, name, birth_year) VALUES ('h1', '同名馬', 2020), ('h2', '同名馬', 2021);
		INSERT INTO race (id, date, course, race_number, name, field_size) VALUES
		('r1', '2026-05-01', '東京', 1, '同日1R', 18), ('r2', '2026-05-01', '東京', 2, '同日2R', 16),
		('current', '2026-06-01', '東京', 1, '対象', 12), ('future', '2026-07-01', '東京', 1, '未来', 12);
		INSERT INTO race_entry (id, race_id, horse_id, horse_number, finish_position, passing, last_3f) VALUES
		('e1', 'r1', 'h1', 1, 4, '8-7-5-4', 34.2), ('e2', 'r2', 'h1', 2, NULL, NULL, NULL),
		('e3', 'r1', 'h2', 2, 1, NULL, 33.0), ('ec', 'current', 'h1', 1, NULL, NULL, NULL),
		('ef', 'future', 'h1', 1, NULL, NULL, NULL);`);
});
afterEach(() => {
	vi.restoreAllMocks();
	sqlite.close();
});

describe('直近5走と本人の各走メモ', () => {
	it('40候補の5走を渡してもD1の100パラメータ上限を超えず本人のメモを読む', async () => {
		sqlite.exec(
			`INSERT INTO note (id, author_id, kind, horse_id, race_id, race_entry_id, body, occurred_at) VALUES ('large-note', 'me', 'preview', 'h1', 'r1', 'e1', '本人の事前メモ', '2026-05-01')`
		);
		const binding = (db as Db & { $client: D1Database }).$client;
		const prepare = binding.prepare.bind(binding);
		const boundCounts: number[] = [];
		vi.spyOn(binding, 'prepare').mockImplementation((query) => {
			const stmt = prepare(query);
			const bind = stmt.bind.bind(stmt);
			stmt.bind = (...values) => {
				if (values.length > 100) throw new Error('D1: too many SQL variables');
				boundCounts.push(values.length);
				return bind(...values);
			};
			return stmt;
		});
		const ids = ['e1', ...Array.from({ length: 199 }, (_, i) => `past-${i}`)];
		const result = await listRaceNoteContext(db, 'current', ids, 'me');
		expect(result.pastRunNotes.get('e1')?.[0].body).toBe('本人の事前メモ');
		expect(boundCounts).toHaveLength(1);
		expect(boundCounts[0]).toBeLessThanOrEqual(100);
	});
	it('レースと出馬表を1バッチで返し、出馬表未登録と不存在も区別する', async () => {
		const binding = (db as Db & { $client: D1Database }).$client;
		const batch = vi.spyOn(binding, 'batch');
		const current = await getRaceForPreview(db, 'current');
		expect(batch).toHaveBeenCalledTimes(1);
		expect(current.race).toMatchObject({ id: 'current', fieldSize: 12 });
		expect(current.entries.map((entry) => entry.entryId)).toEqual(['ec']);
		sqlite.exec(
			`INSERT INTO race (id, date, course, race_number) VALUES ('empty', '2026-06-01', '東京', 4)`
		);
		expect(await getRaceForPreview(db, 'empty')).toMatchObject({
			race: { id: 'empty' },
			entries: []
		});
		expect(await getRaceForPreview(db, 'missing')).toEqual({ race: null, entries: [] });
	});
	it('対象より前を新しい順に取り、結果未入力・実際の頭数・欠損値を保つ', async () => {
		const runs = await listPastRuns(db, ['h1', 'h2'], '2026-06-01');
		expect(runs.get('h1')?.map((run) => run.entryId)).toEqual(['e2', 'e1']);
		expect(runs.get('h1')?.map((run) => run.raceId)).toEqual(['r2', 'r1']);
		expect(runs.get('h1')?.[0]).toMatchObject({
			finishPosition: null,
			fieldSize: 16,
			last3f: null,
			passing: null
		});
		expect(runs.get('h1')?.[1]).toMatchObject({ fieldSize: 18, passing: '8-7-5-4', last3f: 34.2 });
		expect(runs.get('h2')?.map((run) => run.entryId)).toEqual(['e3']);
		expect((await listPastRuns(db, [], '2026-06-01')).size).toBe(0);
	});
	it('出走が多い別の馬がいても、それぞれの最大5走を返す', async () => {
		for (let day = 1; day <= 31; day++) {
			sqlite
				.prepare('INSERT INTO race (id, date, course, race_number) VALUES (?, ?, ?, 3)')
				.run(`many${day}`, `2026-05-${String(day).padStart(2, '0')}`, '東京');
			sqlite
				.prepare('INSERT INTO race_entry (id, race_id, horse_id) VALUES (?, ?, ?)')
				.run(`many-e${day}`, `many${day}`, 'h1');
		}
		const runs = await listPastRuns(db, ['h1', 'h2'], '2026-06-01');
		expect(runs.get('h1')?.map((run) => run.date)).toEqual([
			'2026-05-31',
			'2026-05-30',
			'2026-05-29',
			'2026-05-28',
			'2026-05-27'
		]);
		expect(runs.get('h2')?.map((run) => run.entryId)).toEqual(['e3']);
	});
	it('出走IDで結び、同日別レース・同名馬・他人の共有中/非公開・近況を混ぜない', async () => {
		const insert = sqlite.prepare(
			`INSERT INTO note (id, author_id, kind, horse_id, race_id, race_entry_id, body, tags, mark, visibility, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, '2026-05-01')`
		);
		insert.run('pre', 'me', 'preview', 'h1', 'r1', 'e1', '事前', '◎', 'private');
		insert.run('post', 'me', 'entry', 'h1', 'r1', 'e1', '事後', null, 'private');
		insert.run('same-day', 'me', 'preview', 'h1', 'r2', 'e2', '同日別走', '○', 'private');
		insert.run('same-name', 'me', 'entry', 'h2', 'r1', 'e3', '別馬', null, 'private');
		insert.run('private', 'other', 'entry', 'h1', 'r1', 'e1', '他人非公開', null, 'private');
		insert.run('unlisted', 'other', 'preview', 'h1', 'r1', 'e1', '他人共有中', '◎', 'unlisted');
		insert.run('horse', 'me', 'horse', 'h1', null, null, '近況', null, 'private');
		insert.run('current-note', 'me', 'preview', 'h1', 'current', 'ec', '今回', '▲', 'private');
		const { raceNotes, pastRunNotes: notes } = await listRaceNoteContext(
			db,
			'current',
			['e1', 'e2', 'e3'],
			'me'
		);
		expect(raceNotes.map((note) => note.body)).toEqual(['今回']);
		expect(
			notes
				.get('e1')
				?.map((note) => note.body)
				.sort()
		).toEqual(['事前', '事後']);
		expect(notes.get('e2')?.map((note) => note.body)).toEqual(['同日別走']);
		expect(notes.get('e3')?.map((note) => note.body)).toEqual(['別馬']);
		expect(JSON.stringify([...notes.values()])).not.toMatch(/他人|近況|今回/);
		expect((await listRaceNoteContext(db, 'missing', [], 'me')).pastRunNotes.size).toBe(0);
	});
});
