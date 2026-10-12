import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '$lib/server/db/test-d1';
import { createDb, type Db } from '$lib/server/db';
import { hashSessionToken, validateSession } from '$lib/server/auth/session';
import type { QueryReport } from '$lib/server/db/instrument';
import {
	load as previewLoad,
	actions as previewActions
} from '../../routes/races/[id]/preview/+page.server';
import { load as reviewLoad, actions as reviewActions } from '../../routes/races/[id]/+page.server';

let sqlite: DatabaseSync;
let platform: App.Platform;
let db: Db;
let reports: QueryReport[];
const token = 'request-budget-session';

beforeEach(() => {
	const test = createTestDb();
	sqlite = test.sqlite;
	const binding = (test.db as Db & { $client: D1Database }).$client;
	platform = { env: { DB: binding } } as App.Platform;
	reports = [];
	db = createDb(platform.env, (report) => reports.push(report));
	sqlite.exec(`INSERT INTO user (id, google_sub, email, display_name) VALUES
		('me', 'me', 'me@example.test', '本人'), ('other', 'other', 'other@example.test', '他人');
		INSERT INTO horse (id, name) VALUES ('horse', '架空馬');
		INSERT INTO race (id, date, course, race_number, name, grade, surface, distance, field_size) VALUES
		('current', '2000-06-01', '東京', 11, '架空監査賞', 'G2', '芝', 2000, 18),
		('past', '2000-05-01', '東京', 11, '架空前走', 'G2', '芝', 2000, 18);
		INSERT INTO race_entry (id, race_id, horse_id, jockey, finish_position) VALUES
		('entry', 'current', 'horse', '架空騎手', 1), ('past-entry', 'past', 'horse', '架空騎手', 2);
		INSERT INTO note (id, author_id, kind, horse_id, body, occurred_at) VALUES
		('history', 'me', 'horse', 'horse', '本人の近況', '2000-05-20'),
		('other-history', 'other', 'horse', 'horse', '他人の近況', '2000-05-20');`);
	// 残り1日なので、validateSessionはSELECTと期限更新のUPDATEを両方行う。
	sqlite
		.prepare('INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)')
		.run(hashSessionToken(token), 'me', Math.floor(Date.now() / 1000) + 86400);
});
afterEach(() => sqlite.close());

async function event(form?: FormData) {
	const validated = await validateSession(db, token);
	const locals: App.Locals = {
		user: validated!.user,
		oauthScopes: null,
		mockAuth: false,
		appEnv: 'local',
		monitor: {
			requestId: 'budget-test',
			log: () => undefined,
			onQuery: (report: QueryReport) => {
				reports.push(report);
			}
		}
	};
	return {
		locals,
		platform,
		params: { id: 'current' },
		request: new Request(
			'https://example.test/races/current',
			form ? { method: 'POST', body: form } : undefined
		)
	};
}

describe('予想・ふりかえりの1リクエストのD1往復数', () => {
	type TestEvent = Awaited<ReturnType<typeof event>>;
	for (const [mode, load, action] of [
		[
			'preview',
			(requestEvent: TestEvent) => previewLoad(requestEvent as Parameters<typeof previewLoad>[0]),
			(requestEvent: TestEvent) =>
				previewActions.default!(
					requestEvent as Parameters<NonNullable<typeof previewActions.default>>[0]
				)
		],
		[
			'review',
			(requestEvent: TestEvent) => reviewLoad(requestEvent as Parameters<typeof reviewLoad>[0]),
			(requestEvent: TestEvent) =>
				reviewActions.default!(
					requestEvent as Parameters<NonNullable<typeof reviewActions.default>>[0]
				)
		]
	] as const) {
		it(`${mode}: 更新セッションのGETは10往復以内で本人の近況を返す`, async () => {
			const requestEvent = await event();
			const result = await load(requestEvent);
			expect(reports.length).toBeLessThanOrEqual(10);
			expect(reports).toHaveLength(mode === 'preview' ? 9 : 8);
			expect(result!.rows[0].history.map((note: { id: string }) => note.id)).toEqual(['history']);
			expect(result!.rows[0].entryId).toBe('entry');
		});
		it(`${mode}: JS無効のPOST→loadと期限更新を含め10往復以内で保存結果を読む`, async () => {
			const form = new FormData();
			form.set('raceNoteBody', 'レース全体のメモ');
			form.set('body.entry', '保存後の本文');
			form.set('mark.entry', '◎');
			const requestEvent = await event(form);
			await action(requestEvent);
			const result = await load(requestEvent);
			expect(reports.length).toBeLessThanOrEqual(10);
			expect(reports).toHaveLength(mode === 'preview' ? 10 : 9);
			expect(reports.slice(0, 2).map((report) => report.kind)).toEqual(['statement', 'statement']);
			const row = result!.rows[0];
			expect('myNote' in row ? row.myNote?.body : row.myPreview?.body).toBe('保存後の本文');
			// 次のリクエストにはマスタの再利用状態も本人メモも持ち越さない。
			reports.length = 0;
			const next = await event();
			expect(next.locals.raceFormRead).toBeUndefined();
			await load(next);
			expect(
				reports.some((report) => report.kind === 'batch' && report.sql.includes('preview_entry_id'))
			).toBe(mode === 'preview');
		});
		it(`${mode}: 入力不正のPOST→loadも10往復以内`, async () => {
			const form = new FormData();
			form.set('body.entry', '長'.repeat(10001));
			const requestEvent = await event(form);
			const result = await action(requestEvent);
			expect(result).toMatchObject({ status: 400 });
			await load(requestEvent);
			expect(reports.length).toBeLessThanOrEqual(10);
		});
	}
});
