import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { emptyFlow } from '$lib/schemas/race-flow';
import { listRaceNotes, savePreviewNotes } from './notes';

/**
 * 展開の欄が来なかった保存（出走馬が0頭で、画面に展開の欄が無い）は、保存済みの展開に触らない。
 * 本物の SQLite で、行が消えず・展開が残ることを確かめる。
 */
let state: ReturnType<typeof createTestDb>;
const saved = { ...emptyFlow(), pace: 'スロー' as const };

beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A');
		INSERT INTO race (id,date,course,name) VALUES ('r','2099-01-01','東京','テスト賞');
		INSERT INTO note (id,author_id,kind,race_id,body,flow,occurred_at)
		VALUES ('outlook','a','race_preview','r','前半はゆっくり','${JSON.stringify(saved)}','2099-01-01');
	`);
});
afterEach(() => state.sqlite.close());

const outlook = async () =>
	(await listRaceNotes(state.db, 'r', 'a')).find((n) => n.kind === 'race_preview') ?? null;

describe('展開に触らない見立ての保存', () => {
	it('本文を直しても展開は残る', async () => {
		await savePreviewNotes(
			state.db,
			{ raceId: 'r', raceNote: { body: '内有利' }, entries: [] },
			'a',
			'2099-01-01'
		);
		expect(await outlook()).toMatchObject({ body: '内有利', flow: saved });
	});

	it('本文を空にしても、展開のある行は消さずに本文だけ空にする', async () => {
		await savePreviewNotes(
			state.db,
			{ raceId: 'r', raceNote: { body: '' }, entries: [] },
			'a',
			'2099-01-01'
		);
		expect(await outlook()).toMatchObject({ body: '', flow: saved });
	});

	it('展開が無い行は、本文を空にすると消える', async () => {
		state.sqlite.exec("UPDATE note SET flow=NULL WHERE id='outlook'");
		await savePreviewNotes(
			state.db,
			{ raceId: 'r', raceNote: { body: '' }, entries: [] },
			'a',
			'2099-01-01'
		);
		expect(await outlook()).toBeNull();
	});

	it('展開の欄が来て空（null）なら、展開ごと消える', async () => {
		await savePreviewNotes(
			state.db,
			{ raceId: 'r', raceNote: { body: '', flow: null }, entries: [] },
			'a',
			'2099-01-01'
		);
		expect(await outlook()).toBeNull();
	});
});
