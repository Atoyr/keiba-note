import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '#lib/server/db/test-d1.ts';
import { getHorseTrait, horseTraitsQuery, saveHorseTrait } from './horse-traits';

let state: ReturnType<typeof createTestDb>;
beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO horse (id,name) VALUES ('h1','イチバンボシ'), ('h2','ニバンテ');
	`);
});
afterEach(() => state.sqlite.close());

describe('馬の特徴メモ', () => {
	it('無ければ null、書けば読める', async () => {
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBeNull();
		expect(await saveHorseTrait(state.db, 'h1', '  東京の長い直線向き。\n外に張る。  ', 'a')).toBe(
			'saved'
		);
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBe('東京の長い直線向き。\n外に張る。');
	});

	it('書き直すと上書きで、1本のまま', async () => {
		await saveHorseTrait(state.db, 'h1', '前のメモ', 'a');
		await saveHorseTrait(state.db, 'h1', '新しいメモ', 'a');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBe('新しいメモ');
		const rows = state.sqlite.prepare('SELECT COUNT(*) AS n FROM horse_trait').get() as {
			n: number;
		};
		expect(rows.n).toBe(1);
	});

	it('空（空白だけ）で保存すると消える', async () => {
		await saveHorseTrait(state.db, 'h1', '消えるメモ', 'a');
		expect(await saveHorseTrait(state.db, 'h1', '  \n ', 'a')).toBe('cleared');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBeNull();
	});

	it('別ユーザーのメモは読めず、上書きも消しもしない', async () => {
		await saveHorseTrait(state.db, 'h1', 'aのメモ', 'a');
		expect(await getHorseTrait(state.db, 'h1', 'b')).toBeNull();

		await saveHorseTrait(state.db, 'h1', 'bのメモ', 'b');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBe('aのメモ');
		expect(await getHorseTrait(state.db, 'h1', 'b')).toBe('bのメモ');

		await saveHorseTrait(state.db, 'h1', '', 'b');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBe('aのメモ');
		expect(await getHorseTrait(state.db, 'h1', 'b')).toBeNull();
	});

	it('出走馬たちの分をまとめて読む。自分の分だけで、horseIds が空でも落ちない', async () => {
		await saveHorseTrait(state.db, 'h1', 'aのh1', 'a');
		await saveHorseTrait(state.db, 'h2', 'bのh2', 'b');
		const rows = await horseTraitsQuery(state.db, ['h1', 'h2'], 'a');
		expect(rows).toEqual([{ horseId: 'h1', body: 'aのh1' }]);
		expect(await horseTraitsQuery(state.db, [], 'a')).toEqual([]);
	});
});
