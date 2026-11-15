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

const text = (body: string, tags: Parameters<typeof saveHorseTrait>[2]['tags'] = []) => ({
	body,
	tags
});

describe('馬の特徴メモ', () => {
	it('無ければ null、書けば本文と札を読める', async () => {
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBeNull();
		expect(
			await saveHorseTrait(
				state.db,
				'h1',
				text('  東京の長い直線向き。\n外に張る。  ', ['東京巧者', '左回り巧者']),
				'a'
			)
		).toBe('saved');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toEqual({
			body: '東京の長い直線向き。\n外に張る。',
			tags: ['東京巧者', '左回り巧者']
		});
	});

	it('書き直すと上書きで、1本のまま', async () => {
		await saveHorseTrait(state.db, 'h1', text('前のメモ', ['京都巧者']), 'a');
		await saveHorseTrait(state.db, 'h1', text('新しいメモ', ['中山巧者']), 'a');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toEqual({
			body: '新しいメモ',
			tags: ['中山巧者']
		});
		const rows = state.sqlite.prepare('SELECT COUNT(*) AS n FROM horse_trait').get() as {
			n: number;
		};
		expect(rows.n).toBe(1);
	});

	it('本文が空でも札があれば残り、本文も札も空なら消える', async () => {
		expect(await saveHorseTrait(state.db, 'h1', text('  ', ['マイル巧者']), 'a')).toBe('saved');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toEqual({ body: '', tags: ['マイル巧者'] });
		expect(await saveHorseTrait(state.db, 'h1', text('  \n ', []), 'a')).toBe('cleared');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toBeNull();
	});

	it('別ユーザーのメモは読めず、上書きも消しもしない', async () => {
		await saveHorseTrait(state.db, 'h1', text('aのメモ', ['東京巧者']), 'a');
		expect(await getHorseTrait(state.db, 'h1', 'b')).toBeNull();

		await saveHorseTrait(state.db, 'h1', text('bのメモ'), 'b');
		expect(await getHorseTrait(state.db, 'h1', 'a')).toEqual({
			body: 'aのメモ',
			tags: ['東京巧者']
		});
		expect(await getHorseTrait(state.db, 'h1', 'b')).toEqual({ body: 'bのメモ', tags: [] });

		await saveHorseTrait(state.db, 'h1', text(''), 'b');
		expect((await getHorseTrait(state.db, 'h1', 'a'))?.body).toBe('aのメモ');
		expect(await getHorseTrait(state.db, 'h1', 'b')).toBeNull();
	});

	it('出走馬たちの分をまとめて読む。自分の分だけで、horseIds が空でも落ちない', async () => {
		await saveHorseTrait(state.db, 'h1', text('aのh1', ['京都巧者']), 'a');
		await saveHorseTrait(state.db, 'h2', text('bのh2'), 'b');
		const rows = await horseTraitsQuery(state.db, ['h1', 'h2'], 'a');
		expect(rows).toEqual([{ horseId: 'h1', body: 'aのh1', tags: ['京都巧者'] }]);
		expect(await horseTraitsQuery(state.db, [], 'a')).toEqual([]);
	});
});
