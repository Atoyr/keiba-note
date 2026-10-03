import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { OAuthScope } from '$lib/schemas/oauth';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { handleMcpMessage, type McpReply } from './protocol';
import { TOOLS } from './tools';

let db: Db;
let sqlite: DatabaseSync;

const ALL: OAuthScope[] = ['races:read', 'notes:read', 'notes:write'];
const READ_ONLY: OAuthScope[] = ['races:read', 'notes:read'];
const RACES_ONLY: OAuthScope[] = ['races:read'];
const WRITE_ONLY: OAuthScope[] = ['races:read', 'notes:write'];

/** 自分（A）のメモと他人（B）のメモを、同じレース・同じ馬に1本ずつ置く。 */
beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES
			('A', 'ga', 'a@example.invalid', 'Aの本名'), ('B', 'gb', 'b@example.invalid', 'Bの本名');
		INSERT INTO race (id, date, course, race_number, name, grade, surface, distance) VALUES
			('R', '2099-10-04', '東京', 11, 'テスト賞', 'G1', '芝', 2000);
		INSERT INTO horse (id, name, created_by, profile_memo) VALUES ('H', 'テストホース', 'B', '管理用のメモ');
		INSERT INTO race_entry (id, race_id, horse_id, horse_number, jockey) VALUES ('E', 'R', 'H', 1, 'テスト騎手');
		INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, mark, occurred_at, visibility) VALUES
			('NA1', 'A', 'race_preview', 'R', NULL, NULL, '自分の見立て', NULL, '2099-10-04', 'private'),
			('NA2', 'A', 'preview', 'R', 'H', 'E', '自分の出走前メモ', '◎', '2099-10-04', 'private'),
			('NA3', 'A', 'horse', NULL, 'H', NULL, '自分の近況メモ', NULL, '2099-09-01', 'private'),
			('NB1', 'B', 'race_preview', 'R', NULL, NULL, '他人の見立て', NULL, '2099-10-04', 'unlisted'),
			('NB2', 'B', 'preview', 'R', 'H', 'E', '他人の出走前メモ', '▲', '2099-10-04', 'unlisted'),
			('NB3', 'B', 'horse', NULL, 'H', NULL, '他人の近況メモ', NULL, '2099-09-02', 'unlisted');
	`);
});

const call = (name: string, args: Record<string, unknown>, scopes = ALL, viewerId = 'A') =>
	handleMcpMessage(
		{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
		{ db, viewerId, scopes }
	);

/** tool の結果（テキストの JSON）を読む。誤りなら isError ごと返す。 */
function body(reply: McpReply) {
	if (reply.kind !== 'json') throw new Error(`json ではない: ${reply.kind}`);
	return reply.body as {
		result?: { content: { text: string }[]; isError?: boolean; tools?: { name: string }[] };
		error?: { code: number; message: string };
	};
}
const data = (reply: McpReply) => JSON.parse(body(reply).result!.content[0].text);

describe('スコープ', () => {
	it('notes:read が無ければ、tools/list にメモの tool が出ない', async () => {
		const list = async (scopes: OAuthScope[]) =>
			body(
				await handleMcpMessage(
					{ jsonrpc: '2.0', id: 1, method: 'tools/list' },
					{ db, viewerId: 'A', scopes }
				)
			).result!.tools!.map((t) => t.name);

		expect(await list(RACES_ONLY)).toEqual(['search_races', 'get_race', 'get_horse']);
		expect(await list(READ_ONLY)).not.toContain('save_my_race_preview');
		expect(await list(WRITE_ONLY)).toEqual([
			'search_races',
			'get_race',
			'get_horse',
			'save_my_race_preview'
		]);
		expect(await list(ALL)).toEqual(TOOLS.map((t) => t.name));
		expect(await list([])).toEqual([]);
	});

	it.each(TOOLS.filter((t) => t.scope === 'notes:read').map((t) => t.name))(
		'notes:read が無いトークンで %s を呼ぶと、動かさずに 403（insufficient_scope）',
		async (name) => {
			const reply = await call(name, { raceId: 'R', horseId: 'H' }, RACES_ONLY);
			expect(reply).toMatchObject({ kind: 'insufficientScope', scope: 'notes:read' });
			// 中身を1文字も返していない。
			expect(JSON.stringify(reply)).not.toContain('自分の');
		}
	);

	it('races:read が無いトークンではマスタの tool も呼べない', async () => {
		expect(await call('get_race', { raceId: 'R' }, [])).toMatchObject({
			kind: 'insufficientScope',
			scope: 'races:read'
		});
	});

	it('races:read だけなら、レースの一覧に自分のメモの件数も載せない', async () => {
		const [race] = data(await call('search_races', {}, RACES_ONLY)).races;
		expect(race).not.toHaveProperty('myNoteCount');
		const [withNotes] = data(await call('search_races', {})).races;
		// 自分の2本（見立て・出走前メモ）だけ。他人の2本は数えない。
		expect(withNotes.myNoteCount).toBe(2);
	});
});

describe('他人のデータが見えない', () => {
	it('get_my_race_notes は自分のメモだけ', async () => {
		const out = data(await call('get_my_race_notes', { raceId: 'R' }));
		expect(out.notes.map((n: { body: string }) => n.body).sort()).toEqual(
			['自分の出走前メモ', '自分の見立て'].sort()
		);
		expect(JSON.stringify(out)).not.toContain('他人');
	});

	it('get_my_horse_notes は自分のメモだけ', async () => {
		const out = data(await call('get_my_horse_notes', { horseId: 'H' }));
		expect(out.notes.map((n: { body: string }) => n.body)).toContain('自分の近況メモ');
		expect(JSON.stringify(out)).not.toContain('他人');
	});

	it('list_my_recent_notes は自分のメモだけ', async () => {
		const out = data(await call('list_my_recent_notes', {}));
		expect(out.notes).toHaveLength(3);
		expect(JSON.stringify(out)).not.toContain('他人');
	});

	it('同じ tool を B のトークンで呼ぶと B のメモだけになる', async () => {
		const out = JSON.stringify(data(await call('list_my_recent_notes', {}, ALL, 'B')));
		expect(out).toContain('他人の近況メモ');
		expect(out).not.toContain('自分の');
	});

	it('公開範囲（unlisted）でも他人のメモは出さない', async () => {
		// B のメモは共有中（unlisted）。共有ページ以外では見えてはいけない。
		for (const [name, args] of [
			['get_my_race_notes', { raceId: 'R' }],
			['get_my_horse_notes', { horseId: 'H' }],
			['list_my_recent_notes', {}]
		] as const) {
			expect(JSON.stringify(data(await call(name, args)))).not.toContain('他人');
		}
	});

	it.each([['viewerId'], ['userId'], ['authorId']])(
		'入力で %s を渡して読む相手を変えることはできない',
		async (key) => {
			const reply = body(await call('list_my_recent_notes', { [key]: 'B' }));
			expect(reply.result?.isError).toBe(true);
			expect(JSON.stringify(reply)).not.toContain('他人');
		}
	);

	it('マスタの tool は、書いた人の id・名前・メール・管理用のメモを返さない', async () => {
		const out = JSON.stringify([
			data(await call('get_race', { raceId: 'R' })),
			data(await call('get_horse', { horseId: 'H' })),
			data(await call('search_races', {}))
		]);
		for (const secret of ['"B"', 'Bの本名', 'b@example.invalid', '管理用のメモ', 'created']) {
			expect(out).not.toContain(secret);
		}
	});

	it('メモの tool も、書いた人の名前と公開範囲を返さない', async () => {
		const out = JSON.stringify(data(await call('get_my_race_notes', { raceId: 'R' })));
		expect(out).not.toContain('Aの本名');
		expect(out).not.toContain('visibility');
		expect(out).not.toContain('authorId');
	});
});

describe('tools', () => {
	it('get_race は出走馬を返す', async () => {
		const out = data(await call('get_race', { raceId: 'R' }, RACES_ONLY));
		expect(out.race).toMatchObject({ id: 'R', name: 'テスト賞', grade: 'G1' });
		expect(out.entries).toEqual([
			expect.objectContaining({ entryId: 'E', horseName: 'テストホース', horseNumber: 1 })
		]);
	});

	it('無いレースは tool の誤り（isError）', async () => {
		const reply = body(await call('get_race', { raceId: 'nope' }));
		expect(reply.result?.isError).toBe(true);
		expect(reply.result?.content[0].text).toContain('見つかりません');
	});

	it('入力の型が違えば tool の誤り', async () => {
		const reply = body(await call('search_races', { limit: 1000 }));
		expect(reply.result?.isError).toBe(true);
	});

	it('知らない tool はプロトコルの誤り', async () => {
		expect(body(await call('delete_note', {})).error?.code).toBe(-32602);
	});
});

describe('プロトコル', () => {
	const ctx = () => ({ db, viewerId: 'A', scopes: ALL });

	it('initialize は相手の版を知っていればそれを、知らなければ最新を返す', async () => {
		const init = async (protocolVersion: string) =>
			body(
				await handleMcpMessage(
					{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion } },
					ctx()
				)
			).result as unknown as { protocolVersion: string };
		expect((await init('2025-06-18')).protocolVersion).toBe('2025-06-18');
		expect((await init('1999-01-01')).protocolVersion).toBe('2025-11-25');
	});

	it('通知には返事をしない', async () => {
		expect(
			await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())
		).toEqual({ kind: 'accepted' });
	});

	it('id を持つのに形が崩れた要求は、通知として黙って捨てずに -32600 で返す', async () => {
		for (const msg of [
			{ jsonrpc: '2.0', id: 7, method: 42 },
			{ jsonrpc: '2.0', id: null, method: 'tools/list' },
			{ jsonrpc: '2.0', id: {}, method: 'ping' }
		]) {
			const reply = await handleMcpMessage(msg, ctx());
			expect(reply).toMatchObject({ kind: 'json', status: 400 });
			expect(body(reply).error?.code).toBe(-32600);
		}
	});

	it('クライアントからの応答（result を持つ）には返事をしない', async () => {
		expect(await handleMcpMessage({ jsonrpc: '2.0', id: 1, result: {} }, ctx())).toEqual({
			kind: 'accepted'
		});
	});

	it('バッチと壊れた要求は 400', async () => {
		expect(await handleMcpMessage([], ctx())).toMatchObject({ status: 400 });
		expect(await handleMcpMessage({ hello: 1 }, ctx())).toMatchObject({ status: 400 });
	});

	it('知らないメソッドは -32601', async () => {
		const reply = body(
			await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, ctx())
		);
		expect(reply.error?.code).toBe(-32601);
	});

	it('どの tool も入力は余計な項目を受けない', () => {
		for (const t of TOOLS) {
			expect(t.input.type).toBe('strict_object');
		}
	});

	it('読むだけと名乗るのは notes:write の要らない tool だけ', async () => {
		const tools = body(
			await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx())
		).result!.tools! as unknown as { name: string; annotations: { readOnlyHint: boolean } }[];
		for (const t of tools) {
			const write = TOOLS.find((x) => x.name === t.name)!.scope === 'notes:write';
			expect(t.annotations.readOnlyHint).toBe(!write);
		}
	});
});

describe('save_my_race_preview', () => {
	type Row = { author_id: string; kind: string; body: string; mark: string | null; tags: string };
	const notes = (author: string) =>
		sqlite
			.prepare(
				`SELECT author_id, kind, body, mark, tags FROM note WHERE author_id = ? AND race_id = 'R' ORDER BY kind`
			)
			.all(author) as Row[];
	const save = (args: Record<string, unknown>, scopes = ALL, viewerId = 'A') =>
		call('save_my_race_preview', { raceId: 'R', ...args }, scopes, viewerId);

	it('notes:write が無いトークンでは、動かさずに 403（insufficient_scope）', async () => {
		const before = notes('A');
		const reply = await save({ entries: [{ entryId: 'E', mark: '×' }] }, READ_ONLY);
		expect(reply).toMatchObject({ kind: 'insufficientScope', scope: 'notes:write' });
		expect(notes('A')).toEqual(before);
	});

	it('渡した項目だけを書き換え、省いた項目と見立てはそのまま残す', async () => {
		const out = data(await save({ entries: [{ entryId: 'E', mark: '○' }] }));
		expect(out).toEqual({
			raceId: 'R',
			raceNote: 'unchanged',
			entries: [{ entryId: 'E', result: 'saved' }]
		});
		expect(notes('A')).toEqual([
			expect.objectContaining({ kind: 'preview', body: '自分の出走前メモ', mark: '○' }),
			expect.objectContaining({ kind: 'race_preview', body: '自分の見立て' })
		]);
	});

	it('見立てと札を書ける。札は決まった順にそろえる', async () => {
		await save({
			raceNote: { body: '  新しい見立て  ' },
			entries: [{ entryId: 'E', body: '新しいメモ', tags: ['好上がり', '次走買い'] }]
		});
		const [preview, race] = notes('A');
		expect(race.body).toBe('新しい見立て');
		expect(preview).toMatchObject({ body: '新しいメモ', mark: '◎' });
		expect(JSON.parse(preview.tags)).toEqual(['次走買い', '好上がり']);
	});

	it('本文・印・札をすべて空にした馬の出走前メモは消える', async () => {
		const out = data(await save({ entries: [{ entryId: 'E', body: '', mark: null, tags: [] }] }));
		expect(out.entries).toEqual([{ entryId: 'E', result: 'cleared' }]);
		expect(notes('A').map((n) => n.kind)).toEqual(['race_preview']);
	});

	it('他人のメモには触れず、トークンの持ち主のメモだけを書く', async () => {
		const others = notes('B');
		await save({ raceNote: { body: 'Aが書いた' }, entries: [{ entryId: 'E', mark: '×' }] });
		expect(notes('B')).toEqual(others);

		await save({ entries: [{ entryId: 'E', mark: '△' }] }, ALL, 'B');
		expect(notes('B')).toEqual([
			expect.objectContaining({ kind: 'preview', body: '他人の出走前メモ', mark: '△' }),
			expect.objectContaining({ kind: 'race_preview', body: '他人の見立て' })
		]);
		expect(notes('A')[0].mark).toBe('×');
	});

	it('notes:read が無くても書けるが、省いた項目の今の値は返さない', async () => {
		const reply = await save({ entries: [{ entryId: 'E', mark: '▲' }] }, WRITE_ONLY);
		expect(JSON.stringify(reply)).not.toContain('自分の');
		expect(notes('A')[0]).toMatchObject({ body: '自分の出走前メモ', mark: '▲' });
	});

	it('別のレースの出走馬には書けない', async () => {
		sqlite.exec(`
			INSERT INTO race (id, date, course, race_number, name) VALUES ('R2', '2099-10-05', '京都', 11, '別のレース');
			INSERT INTO race_entry (id, race_id, horse_id, horse_number) VALUES ('E2', 'R2', 'H', 1);
		`);
		const reply = body(await save({ entries: [{ entryId: 'E2', mark: '◎' }] }));
		expect(reply.result?.isError).toBe(true);
		expect(reply.result?.content[0].text).toContain('出走馬ではありません');
		expect(
			sqlite.prepare(`SELECT count(*) AS n FROM note WHERE race_entry_id = 'E2'`).get()
		).toEqual({ n: 0 });
	});

	it.each([
		['何も渡さない', {}],
		['知らない印', { entries: [{ entryId: 'E', mark: '★' }] }],
		['知らない札', { entries: [{ entryId: 'E', tags: ['勝負'] }] }],
		[
			'同じ馬を2回',
			{
				entries: [
					{ entryId: 'E', mark: '◎' },
					{ entryId: 'E', mark: '×' }
				]
			}
		],
		['horseId を渡す', { entries: [{ entryId: 'E', horseId: 'H', mark: '◎' }] }],
		['展開を渡す', { raceNote: { body: 'x', flow: {} } }],
		['書く人を渡す', { authorId: 'B', raceNote: { body: 'x' } }]
	])('%s と tool の誤りで、何も書かない', async (_, args) => {
		const before = [notes('A'), notes('B')];
		expect(body(await save(args)).result?.isError).toBe(true);
		expect([notes('A'), notes('B')]).toEqual(before);
	});

	it('無いレースは tool の誤り', async () => {
		const reply = body(
			await call('save_my_race_preview', { raceId: 'nope', raceNote: { body: 'x' } })
		);
		expect(reply.result?.isError).toBe(true);
	});
});
