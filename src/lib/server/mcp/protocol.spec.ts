import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { OAuthScope } from '$lib/schemas/oauth';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { MCP_WEEKLY_LIMITS, mcpWeekStart } from '$lib/utils/mcp-quota';
import { handleMcpMessage, type McpReply } from './protocol';
import { TOOLS } from './tools';

let db: Db;
let sqlite: DatabaseSync;

const ALL: OAuthScope[] = ['races:read', 'notes:read', 'notes:write', 'reviews:write'];
const READ_ONLY: OAuthScope[] = ['races:read', 'notes:read'];
/** notes:write はあるが reviews:write は無い（ふりかえりの書き込みが加わる前につないだ連携）。 */
const PREVIEW_ONLY: OAuthScope[] = ['races:read', 'notes:read', 'notes:write'];
const RACES_ONLY: OAuthScope[] = ['races:read'];
const WRITE_ONLY: OAuthScope[] = ['races:read', 'notes:write'];
const REVIEW_ONLY: OAuthScope[] = ['races:read', 'reviews:write'];

/** 自分（A）のメモと他人（B）のメモを、同じレース・同じ馬に1本ずつ置く。 */
beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES
			('A', 'ga', 'a@example.invalid', 'Aの本名'), ('B', 'gb', 'b@example.invalid', 'Bの本名');
		INSERT INTO race (id, date, course, race_number, name, grade, surface, distance) VALUES
			('R', '2099-10-04', '東京', 11, 'テスト賞', 'G1', '芝', 2000),
			('P', '2020-10-04', '京都', 11, '済んだ賞', 'G2', '芝', 2200);
		INSERT INTO horse (id, name, created_by, profile_memo) VALUES ('H', 'テストホース', 'B', '管理用のメモ');
		INSERT INTO race_entry (id, race_id, horse_id, horse_number, jockey) VALUES
			('E', 'R', 'H', 1, 'テスト騎手'), ('PE', 'P', 'H', 1, 'テスト騎手');
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
		// reviews:write が無い連携（notes:write だけ）には、ふりかえりを書く tool は出ない。
		expect(await list(PREVIEW_ONLY)).not.toContain('save_my_race_review');
		expect(await list(REVIEW_ONLY)).toEqual([
			'search_races',
			'get_race',
			'get_horse',
			'save_my_race_review'
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

describe('週ごとの上限', () => {
	const usage = () =>
		sqlite.prepare("SELECT reads, writes FROM mcp_usage WHERE user_id = 'A'").get() as
			{ reads: number; writes: number } | undefined;
	/** 今週の行を直接置いて、上限の状態を作る。 */
	const put = (reads: number, writes: number) =>
		sqlite
			.prepare(
				"INSERT OR REPLACE INTO mcp_usage (user_id, week_start, reads, writes, updated_at) VALUES ('A', ?, ?, ?, 0)"
			)
			.run(mcpWeekStart(new Date()), reads, writes);

	it('呼ぶと数える。読む tool は reads、書く tool は writes', async () => {
		await call('get_race', { raceId: 'R' });
		expect(usage()).toEqual({ reads: 1, writes: 0 });
		await call('save_my_race_preview', { raceId: 'R', raceNote: { body: '見立て' } });
		expect(usage()).toEqual({ reads: 1, writes: 1 });
	});

	it('読み取りが上限だと、読む tool は動かさずに誤りで返す。書く tool は通る', async () => {
		put(MCP_WEEKLY_LIMITS.read, 0);
		const reply = await call('get_race', { raceId: 'R' });
		expect(reply).toMatchObject({ kind: 'json', status: 200 });
		const b = body(reply);
		expect(b.result?.isError).toBe(true);
		expect(b.result?.content[0].text).toMatch(
			/^今週の読み取りの上限（500回）に達しました。\d+月\d+日（水）12:00（日本時間）に戻ります。$/
		);
		expect(usage()).toEqual({ reads: MCP_WEEKLY_LIMITS.read, writes: 0 });

		const saved = body(
			await call('save_my_race_preview', { raceId: 'R', raceNote: { body: 'x' } })
		);
		expect(saved.result?.isError).toBeUndefined();
		expect(usage()).toEqual({ reads: MCP_WEEKLY_LIMITS.read, writes: 1 });
	});

	it('書き込みが上限だと、書く tool は動かさずに誤りで返す。読む tool は通る', async () => {
		put(0, MCP_WEEKLY_LIMITS.write);
		const b = body(await call('save_my_race_preview', { raceId: 'R', raceNote: { body: 'x' } }));
		expect(b.result?.isError).toBe(true);
		expect(b.result?.content[0].text).toContain('今週の書き込みの上限（100回）に達しました');
		expect(
			sqlite.prepare("SELECT count(*) AS n FROM note WHERE author_id = 'A' AND body = 'x'").get()
		).toEqual({ n: 0 });

		expect(body(await call('get_race', { raceId: 'R' })).result?.isError).toBeUndefined();
	});

	it('ほかのユーザーの上限には影響されない', async () => {
		put(MCP_WEEKLY_LIMITS.read, MCP_WEEKLY_LIMITS.write);
		expect(body(await call('get_race', { raceId: 'R' }, ALL, 'B')).result?.isError).toBeUndefined();
	});

	it('tools/list・入力の誤り・スコープ不足・知らない tool は数えない', async () => {
		await handleMcpMessage(
			{ jsonrpc: '2.0', id: 1, method: 'tools/list' },
			{ db, viewerId: 'A', scopes: ALL }
		);
		await call('search_races', { limit: 1000 });
		await call('get_my_race_notes', { raceId: 'R' }, RACES_ONLY);
		await call('delete_note', {});
		expect(usage()).toBeUndefined();
	});

	it('initialize の説明に、上限があることを書く', async () => {
		const reply = body(
			await handleMcpMessage(
				{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
				{ db, viewerId: 'A', scopes: ALL }
			)
		);
		expect(JSON.stringify(reply)).toContain('週ごとの回数の上限');
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

	it('読むだけと名乗るのは、書きのスコープが要らない tool だけ', async () => {
		const tools = body(
			await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx())
		).result!.tools! as unknown as { name: string; annotations: { readOnlyHint: boolean } }[];
		for (const t of tools) {
			const scope = TOOLS.find((x) => x.name === t.name)!.scope;
			const write = scope === 'notes:write' || scope === 'reviews:write';
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
		// 同じ出走馬に B の出走前メモがあっても、消えるのは A の行だけ（DELETE の WHERE に author_id）。
		expect(notes('B')).toEqual([
			expect.objectContaining({ kind: 'preview', body: '他人の出走前メモ', mark: '▲' }),
			expect.objectContaining({ kind: 'race_preview', body: '他人の見立て' })
		]);
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

	it('見立ての本文を空にしても、保存済みの展開は残る', async () => {
		sqlite.exec(
			`UPDATE note SET flow = '{"pace":"スロー","start":{"spots":[],"memo":"x"},"corner4":{"spots":[],"memo":""},"finish":{"spots":[],"memo":""}}' WHERE id = 'NA1'`
		);
		expect(data(await save({ raceNote: { body: '' } })).raceNote).toBe('cleared');
		const row = sqlite.prepare(`SELECT body, flow FROM note WHERE id = 'NA1'`).get() as {
			body: string;
			flow: string;
		};
		expect(row.body).toBe('');
		expect(JSON.parse(row.flow).pace).toBe('スロー');
	});

	it('無いレースは tool の誤り', async () => {
		const reply = body(
			await call('save_my_race_preview', { raceId: 'nope', raceNote: { body: 'x' } })
		);
		expect(reply.result?.isError).toBe(true);
	});
});

describe('save_my_race_review', () => {
	type Row = { author_id: string; kind: string; body: string; mark: string | null; tags: string };
	/** 開催済みのレース 'P' の、その人のメモ。 */
	const notes = (author: string) =>
		sqlite
			.prepare(
				`SELECT author_id, kind, body, mark, tags FROM note WHERE author_id = ? AND race_id = 'P' ORDER BY kind`
			)
			.all(author) as Row[];
	const review = (args: Record<string, unknown>, scopes = ALL, viewerId = 'A', raceId = 'P') =>
		call('save_my_race_review', { raceId, ...args }, scopes, viewerId);

	/** A のふりかえり（レースのメモと PE のメモ）と予想、B のふりかえり（レースのメモと PE のメモ）を置く。 */
	beforeEach(() => {
		sqlite.exec(`
			INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, visibility) VALUES
				('PA1', 'A', 'race', 'P', NULL, NULL, '自分のレースのメモ', '[]', NULL, '2020-10-04', 'private'),
				('PA2', 'A', 'entry', 'P', 'H', 'PE', '自分のふりかえり', '["不利"]', NULL, '2020-10-04', 'private'),
				('PA3', 'A', 'race_preview', 'P', NULL, NULL, '自分の見立て', '[]', NULL, '2020-10-04', 'private'),
				('PA4', 'A', 'preview', 'P', 'H', 'PE', '自分の出走前メモ', '[]', '◎', '2020-10-04', 'private'),
				('PB1', 'B', 'race', 'P', NULL, NULL, '他人のレースのメモ', '[]', NULL, '2020-10-04', 'unlisted'),
				('PB2', 'B', 'entry', 'P', 'H', 'PE', '他人のふりかえり', '[]', NULL, '2020-10-04', 'unlisted');
		`);
	});

	it('reviews:write が無いトークン（notes:write だけ）では、動かさずに 403（insufficient_scope）', async () => {
		const before = notes('A');
		const reply = await review({ raceNote: { body: '書けない' } }, PREVIEW_ONLY);
		expect(reply).toMatchObject({ kind: 'insufficientScope', scope: 'reviews:write' });
		expect(notes('A')).toEqual(before);
		// 数えない（スコープ不足は上限の対象外）。
		expect(sqlite.prepare('SELECT count(*) AS n FROM mcp_usage').get()).toEqual({ n: 0 });
	});

	it('渡した項目だけを書き換え、省いた項目とレースのメモはそのまま残す', async () => {
		const out = data(await review({ entries: [{ entryId: 'PE', tags: ['好上がり'] }] }));
		expect(out).toEqual({
			raceId: 'P',
			raceNote: 'unchanged',
			entries: [{ entryId: 'PE', result: 'saved' }]
		});
		const rows = notes('A');
		expect(rows.find((n) => n.kind === 'entry')).toMatchObject({ body: '自分のふりかえり' });
		expect(JSON.parse(rows.find((n) => n.kind === 'entry')!.tags)).toEqual(['好上がり']);
		expect(rows.find((n) => n.kind === 'race')).toMatchObject({ body: '自分のレースのメモ' });
	});

	it('レースのメモと本文を書ける。札は決まった順にそろえる', async () => {
		const out = data(
			await review({
				raceNote: { body: '  新しいレースのメモ  ' },
				entries: [{ entryId: 'PE', body: '新しい本文', tags: ['好上がり', '次走買い'] }]
			})
		);
		expect(out.raceNote).toBe('saved');
		const rows = notes('A');
		expect(rows.find((n) => n.kind === 'race')!.body).toBe('新しいレースのメモ');
		const entry = rows.find((n) => n.kind === 'entry')!;
		expect(entry.body).toBe('新しい本文');
		expect(JSON.parse(entry.tags)).toEqual(['次走買い', '好上がり']);
	});

	it('書いていない馬には、新しくふりかえりメモを作る', async () => {
		sqlite.exec(`DELETE FROM note WHERE id = 'PA2'`);
		await review({ entries: [{ entryId: 'PE', body: '初めて書く' }] });
		expect(notes('A').find((n) => n.kind === 'entry')).toMatchObject({
			body: '初めて書く',
			tags: '[]'
		});
	});

	it('本文と札を両方空にした馬のふりかえりメモは消える', async () => {
		const out = data(await review({ entries: [{ entryId: 'PE', body: '', tags: [] }] }));
		expect(out.entries).toEqual([{ entryId: 'PE', result: 'cleared' }]);
		expect(notes('A').map((n) => n.kind)).not.toContain('entry');
		// B の行は残る（DELETE の WHERE に author_id）。
		expect(notes('B')).toEqual([
			expect.objectContaining({ kind: 'entry', body: '他人のふりかえり' }),
			expect.objectContaining({ kind: 'race', body: '他人のレースのメモ' })
		]);
	});

	it('レースのメモの本文を空にするとレースのメモが消える', async () => {
		const out = data(await review({ raceNote: { body: '' } }));
		expect(out.raceNote).toBe('cleared');
		expect(notes('A').map((n) => n.kind)).not.toContain('race');
		// B のレースのメモは残る（DELETE の WHERE に author_id）。
		expect(notes('B')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'race', body: '他人のレースのメモ' })
			])
		);
	});

	it('予想（見立て・出走前メモの本文と印）には触れない', async () => {
		await review({
			raceNote: { body: '' },
			entries: [{ entryId: 'PE', body: '', tags: [] }]
		});
		expect(notes('A')).toEqual([
			expect.objectContaining({ kind: 'preview', body: '自分の出走前メモ', mark: '◎' }),
			expect.objectContaining({ kind: 'race_preview', body: '自分の見立て' })
		]);
	});

	it('他人のメモには触れず、トークンの持ち主のメモだけを書く', async () => {
		const others = notes('B');
		await review({ raceNote: { body: 'Aが書いた' }, entries: [{ entryId: 'PE', body: 'A' }] });
		expect(notes('B')).toEqual(others);

		await review({ entries: [{ entryId: 'PE', body: 'Bが書いた' }] }, ALL, 'B');
		expect(notes('B')).toEqual([
			expect.objectContaining({ kind: 'entry', body: 'Bが書いた' }),
			expect.objectContaining({ kind: 'race', body: '他人のレースのメモ' })
		]);
		expect(notes('A').find((n) => n.kind === 'entry')!.body).toBe('A');
	});

	it('開催前のレース（2099年）には書けない。何も書かない', async () => {
		const before = sqlite.prepare(`SELECT id, body FROM note ORDER BY id`).all();
		const reply = body(
			await review(
				{ raceNote: { body: '先走り' }, entries: [{ entryId: 'E', body: 'x' }] },
				ALL,
				'A',
				'R'
			)
		);
		expect(reply.result?.isError).toBe(true);
		expect(reply.result?.content[0].text).toBe(
			'まだ開催されていないレースにふりかえりは書けません'
		);
		expect(sqlite.prepare(`SELECT id, body FROM note ORDER BY id`).all()).toEqual(before);
	});

	it('当日のレースには書ける（結果が無くても）', async () => {
		const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
		sqlite.exec(`
			INSERT INTO race (id, date, course, race_number, name) VALUES ('T', '${today}', '中山', 1, '今日の一戦');
			INSERT INTO race_entry (id, race_id, horse_id, horse_number) VALUES ('TE', 'T', 'H', 1);
		`);
		const out = data(await review({ raceNote: { body: '今日のふりかえり' } }, ALL, 'A', 'T'));
		expect(out.raceNote).toBe('saved');
	});

	it('notes:read が無くても書けるが、本文は返さない', async () => {
		const reply = await review({ entries: [{ entryId: 'PE', tags: ['不利'] }] }, REVIEW_ONLY);
		expect(JSON.stringify(reply)).not.toContain('自分の');
		expect(notes('A').find((n) => n.kind === 'entry')).toMatchObject({ body: '自分のふりかえり' });
	});

	it('別のレースの出走馬には書けない', async () => {
		const reply = body(await review({ entries: [{ entryId: 'E', body: 'x' }] }));
		expect(reply.result?.isError).toBe(true);
		expect(reply.result?.content[0].text).toContain('出走馬ではありません');
		expect(
			sqlite
				.prepare(`SELECT count(*) AS n FROM note WHERE race_entry_id = 'E' AND kind = 'entry'`)
				.get()
		).toEqual({ n: 0 });
	});

	it.each([
		['何も渡さない', {}],
		['知らない札', { entries: [{ entryId: 'PE', tags: ['勝負'] }] }],
		[
			'同じ馬を2回',
			{
				entries: [
					{ entryId: 'PE', body: 'a' },
					{ entryId: 'PE', body: 'b' }
				]
			}
		],
		['印を渡す', { entries: [{ entryId: 'PE', mark: '◎' }] }],
		['horseId を渡す', { entries: [{ entryId: 'PE', horseId: 'H', body: 'x' }] }],
		['展開を渡す', { raceNote: { body: 'x', flow: {} } }],
		['書く人を渡す', { authorId: 'B', raceNote: { body: 'x' } }]
	])('%s と tool の誤りで、何も書かない', async (_, args) => {
		const before = [notes('A'), notes('B')];
		expect(body(await review(args)).result?.isError).toBe(true);
		expect([notes('A'), notes('B')]).toEqual(before);
	});

	it('無いレースは tool の誤り', async () => {
		const reply = body(await review({ raceNote: { body: 'x' } }, ALL, 'A', 'nope'));
		expect(reply.result?.isError).toBe(true);
		expect(reply.result?.content[0].text).toContain('レースが見つかりません');
	});

	it('書き込みの枠で数える', async () => {
		await review({ raceNote: { body: 'x' } });
		expect(sqlite.prepare("SELECT reads, writes FROM mcp_usage WHERE user_id = 'A'").get()).toEqual(
			{
				reads: 0,
				writes: 1
			}
		);
	});
});
