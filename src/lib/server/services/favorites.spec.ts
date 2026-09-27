import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import {
	isFavoriteHorse,
	listFavoriteHorses,
	listFavoriteRuns,
	setFavoriteHorse
} from './favorites';

let state: ReturnType<typeof createTestDb>;
beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO horse (id,name) VALUES ('h1','イチバンボシ'), ('h2','ニバンテ'), ('h3','タニンノオシ');
		INSERT INTO race (id,date,course,race_number,name,grade) VALUES
			('past','2026-09-20','中山',11,'先週賞','G2'),
			('today','2026-09-27','阪神',11,'今日賞','G2'),
			('next','2026-10-04','東京',10,'来週賞',NULL);
		INSERT INTO race_entry (id,race_id,horse_id,horse_number,finish_position) VALUES
			('e-past','past','h1',3,1),
			('e-today','today','h1',5,NULL),
			('e-next','next','h1',NULL,NULL),
			('e-other','next','h3',2,NULL);
	`);
});
afterEach(() => state.sqlite.close());

describe('推しの馬', () => {
	it('推しにする・外すは何度押しても同じ状態になる', async () => {
		expect(await isFavoriteHorse(state.db, 'h1', 'a')).toBe(false);
		await setFavoriteHorse(state.db, 'h1', 'a', true);
		await setFavoriteHorse(state.db, 'h1', 'a', true);
		expect(await isFavoriteHorse(state.db, 'h1', 'a')).toBe(true);
		expect(state.sqlite.prepare('SELECT count(*) AS n FROM favorite_horse').get()).toEqual({
			n: 1
		});

		await setFavoriteHorse(state.db, 'h1', 'a', false);
		await setFavoriteHorse(state.db, 'h1', 'a', false);
		expect(await isFavoriteHorse(state.db, 'h1', 'a')).toBe(false);
	});

	it('他人の推しは見えず、外すこともできない', async () => {
		await setFavoriteHorse(state.db, 'h3', 'b', true);

		expect(await isFavoriteHorse(state.db, 'h3', 'a')).toBe(false);
		expect(await listFavoriteHorses(state.db, 'a')).toEqual([]);
		expect(await listFavoriteRuns(state.db, 'a', '2026-09-27')).toEqual([]);

		// a が外しても b の推しは残る（WHERE に user_id が入っている）。
		await setFavoriteHorse(state.db, 'h3', 'a', false);
		expect(await isFavoriteHorse(state.db, 'h3', 'b')).toBe(true);
	});

	it('推しの一覧は馬名の順', async () => {
		await setFavoriteHorse(state.db, 'h2', 'a', true);
		await setFavoriteHorse(state.db, 'h1', 'a', true);
		expect(await listFavoriteHorses(state.db, 'a')).toEqual([
			{ horseId: 'h1', horseName: 'イチバンボシ' },
			{ horseId: 'h2', horseName: 'ニバンテ' }
		]);
	});

	it('出走は今日以降だけを日付の順に返し、他人の推しの馬は混ざらない', async () => {
		await setFavoriteHorse(state.db, 'h1', 'a', true);
		await setFavoriteHorse(state.db, 'h3', 'b', true);

		const runs = await listFavoriteRuns(state.db, 'a', '2026-09-27');
		expect(runs.map((r) => r.entryId)).toEqual(['e-today', 'e-next']);
		expect(runs[0]).toMatchObject({
			horseName: 'イチバンボシ',
			raceName: '今日賞',
			grade: 'G2',
			horseNumber: 5,
			resultCount: 0
		});
		// 枠順の前（登録の段階）は馬番が無い。
		expect(runs[1].horseNumber).toBeNull();
	});

	it('馬がマスタから消えたら推しも消える', async () => {
		await setFavoriteHorse(state.db, 'h2', 'a', true);
		state.sqlite.exec("DELETE FROM horse WHERE id='h2'");
		expect(await listFavoriteHorses(state.db, 'a')).toEqual([]);
	});
});
