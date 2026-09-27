import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { EMPTY_RACE_FILTER } from '$lib/utils/race-filter';
import { listHorses } from './horses';
import { countRaces, listRaces } from './races';

/**
 * レース一覧・馬一覧を100件ずつ読むところ。
 *
 * 見たいのは、ページをつないだときに**重なりも抜けも無い**こと。並びのキー（日付・R・馬名）は
 * 一意でないので、同じキーの行を切れ目（100件目と101件目）にまたがらせて確かめる。
 */
let state: ReturnType<typeof createTestDb>;
beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
	`);
});
afterEach(() => state.sqlite.close());

/** `n` 件目まで。SQLite の再帰 CTE で行を作る。 */
const series = (n: number) =>
	`WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM s WHERE i < ${n})`;

async function readAll<T extends { id: string }>(
	read: (offset: number) => Promise<{ items: T[]; next: number | null }>
) {
	const pages: T[][] = [];
	let offset: number | null = 0;
	while (offset !== null) {
		const page = await read(offset);
		pages.push(page.items);
		offset = page.next;
	}
	return pages;
}

describe('listRaces', () => {
	beforeEach(() => {
		// 1日1レースで 200 件。新しいほうから 100 件目（r101）と同じ日・同じ R に場だけ違う行を
		// 3つ足し、並びのキーが同じ4行が 1ページ目の末尾と 2ページ目の頭にまたがるようにする。
		state.sqlite.exec(`
			${series(200)}
			INSERT INTO race (id, date, course, race_number, name)
			SELECT printf('r%03d', i), date('2000-01-01', '+' || i || ' days'), '中山', 11, 'レース' || i FROM s;
			INSERT INTO race (id, date, course, race_number, name) VALUES
				('tie-a', '2000-04-11', '東京', 11, '同着A'),
				('tie-b', '2000-04-11', '京都', 11, '同着B'),
				('tie-c', '2000-04-11', '阪神', 11, '同着C');
		`);
	});

	it('ページをつなぐと、全部の行が1回ずつ新しい順に並ぶ', async () => {
		const pages = await readAll((offset) => listRaces(state.db, 'a', EMPTY_RACE_FILTER, offset));

		expect(pages.map((p) => p.length)).toEqual([100, 100, 3]);
		const rows = pages.flat();
		expect(new Set(rows.map((r) => r.id)).size).toBe(203);
		const keys = rows.map((r) => r.date);
		expect(keys).toEqual([...keys].sort().reverse());
	});

	it('同じ日・同じ R の行は、切れ目をまたいでも毎回同じ順に並ぶ', async () => {
		const first = await listRaces(state.db, 'a', EMPTY_RACE_FILTER, 0);
		const second = await listRaces(state.db, 'a', EMPTY_RACE_FILTER, 100);
		const ties = [...first.items, ...second.items]
			.filter((r) => r.date === '2000-04-11')
			.map((r) => r.id);
		expect(ties).toEqual(['r101', 'tie-a', 'tie-b', 'tie-c']);
	});

	it('総数は読んだ件数ではなく、絞り込みに当たる全体を数える', async () => {
		expect(await countRaces(state.db)).toBe(203);
		expect(await countRaces(state.db, { year: null, grades: [], q: '同着' })).toBe(3);
		expect(await countRaces(state.db, { year: 1999, grades: [], q: '' })).toBe(0);
	});
});

describe('listHorses', () => {
	beforeEach(() => {
		// 101 頭。同名馬（生年違い）を 100 頭目と 101 頭目にまたがらせる。
		state.sqlite.exec(`
			${series(99)}
			INSERT INTO horse (id, name) SELECT printf('h%03d', i), printf('ウマ%03d', i) FROM s;
			INSERT INTO horse (id, name, birth_year) VALUES
				('twin-2', 'ウマ999', 2022),
				('twin-1', 'ウマ999', 2021);
			INSERT INTO race (id, date, course, race_number) VALUES ('r', '2026-09-27', '中山', 11);
			INSERT INTO race_entry (id, race_id, horse_id) VALUES ('e', 'r', 'twin-1');
			INSERT INTO note (id, author_id, kind, horse_id, body, occurred_at) VALUES
				('n-a', 'a', 'horse', 'twin-1', '自分のメモ', '2026-09-27'),
				('n-b', 'b', 'horse', 'twin-1', '他人のメモ', '2026-09-27');
		`);
	});

	it('ページをつなぐと、同名馬も含めて1頭ずつ名前順に並ぶ', async () => {
		const pages = await readAll((offset) => listHorses(state.db, 'a', '', offset));

		expect(pages.map((p) => p.length)).toEqual([100, 1]);
		const rows = pages.flat();
		expect(rows.slice(-2).map((h) => h.id)).toEqual(['twin-1', 'twin-2']);
		expect(new Set(rows.map((h) => h.id)).size).toBe(101);
	});

	it('2ページ目でもメモの件数は自分の分だけを数える', async () => {
		const second = await listHorses(state.db, 'a', '', 100);
		expect(second.items[0]).toMatchObject({ id: 'twin-2', entryCount: 0, noteCount: 0 });
		const first = await listHorses(state.db, 'a', 'ウマ999');
		expect(first).toMatchObject({ next: null });
		expect(first.items[0]).toMatchObject({ id: 'twin-1', entryCount: 1, noteCount: 1 });
	});
});
