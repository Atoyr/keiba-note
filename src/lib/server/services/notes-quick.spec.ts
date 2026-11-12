import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '#lib/server/db/test-d1.ts';
import { saveEntryReviewBody } from './notes';

/**
 * クイック入力の自動保存。本物の SQLite で、本文だけを書き換えて札を残すことを確かめる。
 */
let state: ReturnType<typeof createTestDb>;

beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES
			('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO horse (id, name) VALUES ('h','架空馬');
		INSERT INTO race (id,date,course,name) VALUES ('r','2000-01-01','東京','テスト賞');
		INSERT INTO race_entry (id, race_id, horse_id) VALUES ('e','r','h');
	`);
});
afterEach(() => state.sqlite.close());

const input = (body: string) => ({ raceId: 'r', entryId: 'e', horseId: 'h', body });
const rows = (author: string) =>
	state.sqlite
		.prepare(
			"SELECT body, tags, occurred_at AS occurredAt FROM note WHERE author_id = ? AND kind = 'entry' AND race_entry_id = 'e'"
		)
		.all(author) as { body: string; tags: string; occurredAt: string }[];

describe('saveEntryReviewBody', () => {
	it('メモが無い馬には、札が空の行を作る', async () => {
		await saveEntryReviewBody(state.db, input(' 直線で詰まった '), 'a', '2000-01-01');
		expect(rows('a')).toEqual([{ body: '直線で詰まった', tags: '[]', occurredAt: '2000-01-01' }]);
	});

	it('本文だけを変えて、札は残す', async () => {
		state.sqlite
			.exec(`INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,tags,occurred_at)
			VALUES ('n','a','entry','r','h','e','前の本文','["不利"]','2000-01-01')`);
		await saveEntryReviewBody(state.db, input('新しい本文'), 'a', '2000-01-01');
		expect(rows('a')).toEqual([{ body: '新しい本文', tags: '["不利"]', occurredAt: '2000-01-01' }]);
	});

	it('空にすると、札の無い行は消える', async () => {
		await saveEntryReviewBody(state.db, input('本文'), 'a', '2000-01-01');
		await saveEntryReviewBody(state.db, input('  '), 'a', '2000-01-01');
		expect(rows('a')).toEqual([]);
	});

	it('空にしても、札のある行は本文だけ空にして残す', async () => {
		state.sqlite
			.exec(`INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,tags,occurred_at)
			VALUES ('n','a','entry','r','h','e','前の本文','["次走買い"]','2000-01-01')`);
		await saveEntryReviewBody(state.db, input(''), 'a', '2000-01-01');
		expect(rows('a')).toEqual([{ body: '', tags: '["次走買い"]', occurredAt: '2000-01-01' }]);
	});

	it('他人のメモには触らない', async () => {
		state.sqlite
			.exec(`INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,tags,occurred_at)
			VALUES ('n','b','entry','r','h','e','Bの本文','["不利"]','2000-01-01')`);
		await saveEntryReviewBody(state.db, input('Aの本文'), 'a', '2000-01-01');
		await saveEntryReviewBody(state.db, input(''), 'a', '2000-01-01');
		expect(rows('b')).toEqual([{ body: 'Bの本文', tags: '["不利"]', occurredAt: '2000-01-01' }]);
		expect(rows('a')).toEqual([]);
	});
});
