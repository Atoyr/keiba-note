import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	BOTH_NOTED_HORSE_ID,
	BRACKET_RACE_ID,
	MCP_REVIEW_RACE,
	MCP_TOKENS,
	MCP_WRITE_RACE,
	OTHER_GRANT,
	OTHER_USER_PREVIEW_BODY,
	OTHER_USER_SAME_CONDITION_BODY,
	OUTER_PREVIEW_BODY,
	SESSION_TOKEN,
	TOGGLE_SHARE_NOTE_BODY
} from './seed';

/**
 * MCP（/mcp）と OAuth 2.1。本番ビルドで、Claude・ChatGPT と同じ順に叩く。
 *
 * 見ていること:
 * - スコープ: races:read だけの連携ではメモの tool が出ず、呼ぶと 403（insufficient_scope）
 * - 書き込み: save_my_race_preview・save_my_race_review は渡した馬の渡した項目だけを書き、書いた人のメモにしか触れない
 * - 他人のデータ: 同じ tool でもトークンの持ち主のメモだけ。入力で相手を選べない
 * - 経路を混ぜない: /mcp は Cookie では入れず、Bearer で画面には入れない
 * - 連携の解除・リフレッシュトークンの使い回しで、トークンが止まる
 *
 * 1つのテストで作った連携はそのテストの中だけで使う（並列で走るため）。seed の連携は解除しない。
 */

/** Claude の手元のアプリと同じループバックの戻り先。ブラウザが実際に行く前に横取りする。 */
const REDIRECT = 'http://127.0.0.1:33419/callback';

const rpc = (method: string, params?: Record<string, unknown>) => ({
	jsonrpc: '2.0',
	id: 1,
	method,
	...(params ? { params } : {})
});

function mcp(request: APIRequestContext, token: string | null, body: unknown, headers = {}) {
	return request.post('/mcp', {
		data: body,
		headers: {
			accept: 'application/json, text/event-stream',
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...headers
		},
		maxRedirects: 0
	});
}

async function callTool(
	request: APIRequestContext,
	token: string,
	name: string,
	args: Record<string, unknown> = {}
) {
	return mcp(request, token, rpc('tools/call', { name, arguments: args }));
}

/** tool の結果の本文（JSON 文字列）。 */
async function toolText(res: Awaited<ReturnType<typeof mcp>>) {
	expect(res.status()).toBe(200);
	const json = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
	return json.result;
}

async function toolNames(request: APIRequestContext, token: string) {
	const res = await mcp(request, token, rpc('tools/list'));
	expect(res.status()).toBe(200);
	return ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map(
		(t) => t.name
	);
}

const NOTE_TOOLS = ['get_my_race_notes', 'get_my_horse_notes', 'list_my_recent_notes'];
const WRITE_LABEL = 'あなたの予想（見立て・印・札・出走前メモ）を書く';
const REVIEW_LABEL = 'あなたのふりかえり（レースのメモ・各馬のメモと札）を書く';

test.describe('案内（メタデータ）', () => {
	test('未ログインで読め、/mcp と認可の口を指している', async ({ request }) => {
		const prm = await request.get('/.well-known/oauth-protected-resource/mcp');
		expect(prm.status()).toBe(200);
		const resource = await prm.json();
		expect(resource.resource).toMatch(/\/mcp$/);
		expect(resource.scopes_supported).toEqual([
			'races:read',
			'notes:read',
			'notes:write',
			'reviews:write'
		]);

		const as = await (await request.get('/.well-known/oauth-authorization-server')).json();
		expect(as).toMatchObject({
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
			grant_types_supported: ['authorization_code', 'refresh_token']
		});
		expect(as.token_endpoint).toMatch(/\/oauth\/token$/);
	});
});

test.describe('/mcp の認証', () => {
	test('認証済みでも大きな本文は413、上限内のpingは200', async ({ request }) => {
		const headers = {
			authorization: `Bearer ${MCP_TOKENS.all}`,
			'content-type': 'application/json'
		};
		const message = JSON.stringify(rpc('ping'));
		// 予想を書く tool のために、OAuth の口（8 KiB）より大きい 64 KiB（limited-body.ts の MCP_BODY_LIMIT）。
		const limit = 64 * 1024;
		for (const size of [limit, limit + 1]) {
			const response = await request.post('/mcp', { headers, data: message.padEnd(size, ' ') });
			expect(response.status()).toBe(size === limit ? 200 : 413);
		}
	});

	test('トークンが無ければ 401 と、認可の案内の場所を返す（ログインへ飛ばさない）', async ({
		request
	}) => {
		const res = await mcp(request, null, rpc('tools/list'));
		expect(res.status()).toBe(401);
		expect(res.headers()['www-authenticate']).toMatch(
			/resource_metadata=".*\/\.well-known\/oauth-protected-resource\/mcp"/
		);
	});

	test('知らないトークン・リフレッシュトークンでは入れない', async ({ request }) => {
		const res = await mcp(request, 'uma_at_unknown', rpc('tools/list'));
		expect(res.status()).toBe(401);
		expect(res.headers()['www-authenticate']).toContain('error="invalid_token"');
	});

	test('ログインの Cookie では /mcp に入れない', async ({ page }) => {
		await login(page);
		const res = await page.request.post('/mcp', { data: rpc('tools/list'), maxRedirects: 0 });
		expect(res.status()).toBe(401);
		expect(await res.text()).not.toContain('search_races');
	});

	test('Bearer では画面に入れない（ログインへ回される）', async ({ request }) => {
		const res = await request.get('/races', {
			headers: { authorization: `Bearer ${MCP_TOKENS.all}` },
			maxRedirects: 0
		});
		expect(res.status()).toBe(302);
		expect(res.headers()['location']).toMatch(/^\/login\?redirect=/);
	});

	test('別のオリジンのブラウザからは呼べない', async ({ request }) => {
		const res = await mcp(request, MCP_TOKENS.all, rpc('tools/list'), {
			origin: 'https://evil.example'
		});
		expect(res.status()).toBe(403);
	});
});

test.describe('スコープ', () => {
	test('races:read だけの連携では、メモの tool が一覧に出ない', async ({ request }) => {
		expect(await toolNames(request, MCP_TOKENS.racesOnly)).toEqual([
			'search_races',
			'get_race',
			'get_horse'
		]);
		expect(await toolNames(request, MCP_TOKENS.all)).toEqual(
			expect.arrayContaining([...NOTE_TOOLS, 'search_races'])
		);
	});

	for (const name of NOTE_TOOLS) {
		test(`races:read だけの連携で ${name} を呼ぶと 403（insufficient_scope）で、メモを返さない`, async ({
			request
		}) => {
			const res = await callTool(request, MCP_TOKENS.racesOnly, name, {
				raceId: BRACKET_RACE_ID,
				horseId: 'x'
			});
			expect(res.status()).toBe(403);
			expect(res.headers()['www-authenticate']).toContain('error="insufficient_scope"');
			expect(res.headers()['www-authenticate']).toContain('scope="notes:read"');
			expect(await res.text()).not.toContain(OUTER_PREVIEW_BODY);
		});
	}

	test('races:read だけでも、マスタは読める', async ({ request }) => {
		const result = await toolText(
			await callTool(request, MCP_TOKENS.racesOnly, 'get_race', { raceId: BRACKET_RACE_ID })
		);
		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toContain('E2Eウチワク');
	});
});

test.describe('予想を書く（save_my_race_preview）', () => {
	// 書くのは別のユーザーのトークンだけ。自分（E2E ユーザー）の画面とキャプチャに混ざらない。
	test('渡した項目だけを書き、省いた本文と札は残る。自分のトークンからは見えない', async ({
		request
	}) => {
		const { id, entryIds, body } = MCP_WRITE_RACE;
		const saved = await toolText(
			await callTool(request, MCP_TOKENS.other, 'save_my_race_preview', {
				raceId: id,
				raceNote: { body: 'AIと決めた見立て' },
				entries: [
					{ entryId: entryIds.a, mark: '◎' },
					{ entryId: entryIds.b, body: 'AIと決めたメモ', tags: ['馬場一致'] }
				]
			})
		);
		expect(saved.isError).toBeUndefined();
		expect(JSON.parse(saved.content[0].text)).toEqual({
			raceId: id,
			raceNote: 'saved',
			entries: [
				{ entryId: entryIds.a, result: 'saved' },
				{ entryId: entryIds.b, result: 'saved' }
			]
		});

		const notes = JSON.parse(
			(
				await toolText(
					await callTool(request, MCP_TOKENS.other, 'get_my_race_notes', { raceId: id })
				)
			).content[0].text
		).notes as {
			kind: string;
			entryId: string | null;
			body: string;
			mark: string | null;
			tags: string[];
		}[];
		expect(notes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'race_preview', body: 'AIと決めた見立て' }),
				expect.objectContaining({ entryId: entryIds.a, body, mark: '◎', tags: ['不利'] }),
				expect.objectContaining({
					entryId: entryIds.b,
					body: 'AIと決めたメモ',
					mark: null,
					tags: ['馬場一致']
				})
			])
		);

		const mine = (
			await toolText(await callTool(request, MCP_TOKENS.all, 'get_my_race_notes', { raceId: id }))
		).content[0].text;
		expect(JSON.parse(mine).notes).toEqual([]);
	});

	test('同じ出走馬に別の人のトークンで書いて消しても、持ち主のメモは残る', async ({ request }) => {
		const { id, entryIds, body } = MCP_WRITE_RACE;
		// 自分（all）は E2E AI予想賞にメモを持たない。全部空で送ると「消す」になるが、自分の行が無いので何も残らない
		// （自分の画面とキャプチャに混ざらない）。別のユーザーの出走前メモは消えてはいけない。
		const cleared = await toolText(
			await callTool(request, MCP_TOKENS.all, 'save_my_race_preview', {
				raceId: id,
				entries: [{ entryId: entryIds.a, body: '', mark: null, tags: [] }]
			})
		);
		expect(cleared.isError).toBeUndefined();
		const others = JSON.parse(
			(
				await toolText(
					await callTool(request, MCP_TOKENS.other, 'get_my_race_notes', { raceId: id })
				)
			).content[0].text
		).notes as { entryId: string | null; body: string; tags: string[] }[];
		expect(others).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ entryId: entryIds.a, body, tags: ['不利'] })
			])
		);
		const mine = (
			await toolText(await callTool(request, MCP_TOKENS.all, 'get_my_race_notes', { raceId: id }))
		).content[0].text;
		expect(JSON.parse(mine).notes).toEqual([]);
	});

	test('別のレースの出走馬には書けない', async ({ request }) => {
		const res = await toolText(
			await callTool(request, MCP_TOKENS.other, 'save_my_race_preview', {
				raceId: MCP_WRITE_RACE.id,
				entries: [{ entryId: '01JE2EWEBMCPENTRY100000000', mark: '◎' }]
			})
		);
		expect(res.isError).toBe(true);
		expect(res.content[0].text).toContain('出走馬ではありません');
	});

	test('races:read だけの連携では一覧に出ず、呼ぶと 403（insufficient_scope）', async ({
		request
	}) => {
		expect(await toolNames(request, MCP_TOKENS.racesOnly)).not.toContain('save_my_race_preview');
		const res = await callTool(request, MCP_TOKENS.racesOnly, 'save_my_race_preview', {
			raceId: MCP_WRITE_RACE.id,
			raceNote: { body: '書けてはいけない' }
		});
		expect(res.status()).toBe(403);
		expect(res.headers()['www-authenticate']).toContain('scope="notes:write"');
	});
});

test.describe('ふりかえりを書く（save_my_race_review）', () => {
	// 書くのは別のユーザーのトークンだけ。自分（E2E ユーザー）の画面とキャプチャに混ざらない。
	type RaceNote = {
		kind: string;
		entryId: string | null;
		body: string;
		mark: string | null;
		tags: string[];
	};
	const raceNotes = async (request: APIRequestContext, token: string, raceId: string) =>
		JSON.parse(
			(await toolText(await callTool(request, token, 'get_my_race_notes', { raceId }))).content[0]
				.text
		).notes as RaceNote[];

	test('渡した項目だけを書き、省いた本文は残る。自分のトークンからは見えない', async ({
		request
	}) => {
		const { id, entryIds, body } = MCP_REVIEW_RACE;
		const saved = await toolText(
			await callTool(request, MCP_TOKENS.other, 'save_my_race_review', {
				raceId: id,
				raceNote: { body: 'AIと話したレースのふりかえり' },
				entries: [
					{ entryId: entryIds.a, tags: ['好上がり'] },
					{ entryId: entryIds.b, body: 'AIと話した馬のふりかえり', tags: ['馬場一致'] }
				]
			})
		);
		expect(saved.isError).toBeUndefined();
		expect(JSON.parse(saved.content[0].text)).toEqual({
			raceId: id,
			raceNote: 'saved',
			entries: [
				{ entryId: entryIds.a, result: 'saved' },
				{ entryId: entryIds.b, result: 'saved' }
			]
		});

		expect(await raceNotes(request, MCP_TOKENS.other, id)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'race', body: 'AIと話したレースのふりかえり' }),
				expect.objectContaining({ kind: 'entry', entryId: entryIds.a, body, tags: ['好上がり'] }),
				expect.objectContaining({
					kind: 'entry',
					entryId: entryIds.b,
					body: 'AIと話した馬のふりかえり',
					tags: ['馬場一致']
				})
			])
		);
		expect(await raceNotes(request, MCP_TOKENS.all, id)).toEqual([]);
	});

	test('開催前のレースには書けず、何も書かれない', async ({ request }) => {
		const res = await toolText(
			await callTool(request, MCP_TOKENS.other, 'save_my_race_review', {
				raceId: MCP_WRITE_RACE.id,
				raceNote: { body: '先走ったふりかえり' }
			})
		);
		expect(res.isError).toBe(true);
		expect(res.content[0].text).toBe('まだ開催されていないレースにふりかえりは書けません');
		const notes = await raceNotes(request, MCP_TOKENS.other, MCP_WRITE_RACE.id);
		expect(notes.map((n) => n.kind)).not.toContain('race');
		expect(JSON.stringify(notes)).not.toContain('先走った');
	});

	test('races:read だけの連携では一覧に出ず、呼ぶと 403（insufficient_scope）', async ({
		request
	}) => {
		expect(await toolNames(request, MCP_TOKENS.racesOnly)).not.toContain('save_my_race_review');
		const res = await callTool(request, MCP_TOKENS.racesOnly, 'save_my_race_review', {
			raceId: MCP_REVIEW_RACE.id,
			raceNote: { body: '書けてはいけない' }
		});
		expect(res.status()).toBe(403);
		expect(res.headers()['www-authenticate']).toContain('scope="reviews:write"');
	});
});

test.describe('他人のデータが見えない', () => {
	test('自分のトークンでは自分のメモだけで、他人のメモは出ない', async ({ request }) => {
		const race = (
			await toolText(
				await callTool(request, MCP_TOKENS.all, 'get_my_race_notes', { raceId: BRACKET_RACE_ID })
			)
		).content[0].text;
		expect(race).toContain(OUTER_PREVIEW_BODY);
		expect(race).not.toContain(OTHER_USER_PREVIEW_BODY);

		const recent = (
			await toolText(await callTool(request, MCP_TOKENS.all, 'list_my_recent_notes', { limit: 50 }))
		).content[0].text;
		for (const other of [
			OTHER_USER_PREVIEW_BODY,
			OTHER_USER_SAME_CONDITION_BODY,
			'見えてはいけない'
		]) {
			expect(recent).not.toContain(other);
		}
	});

	test('同じ tool を別のユーザーのトークンで呼ぶと、その人のメモだけになる', async ({
		request
	}) => {
		const race = (
			await toolText(
				await callTool(request, MCP_TOKENS.other, 'get_my_race_notes', { raceId: BRACKET_RACE_ID })
			)
		).content[0].text;
		expect(race).toContain(OTHER_USER_PREVIEW_BODY);
		expect(race).not.toContain(OUTER_PREVIEW_BODY);
	});

	test('馬のメモも、トークンの持ち主のぶんだけ', async ({ request }) => {
		// 同じ馬に、自分の近況メモと別のユーザーの出走前メモがある。
		const horse = async (token: string) =>
			(
				await toolText(
					await callTool(request, token, 'get_my_horse_notes', { horseId: BOTH_NOTED_HORSE_ID })
				)
			).content[0].text;
		const mine = await horse(MCP_TOKENS.all);
		expect(mine).toContain(TOGGLE_SHARE_NOTE_BODY);
		expect(mine).not.toContain(OTHER_USER_PREVIEW_BODY);
		const theirs = await horse(MCP_TOKENS.other);
		expect(theirs).toContain(OTHER_USER_PREVIEW_BODY);
		expect(theirs).not.toContain(TOGGLE_SHARE_NOTE_BODY);
	});

	test('「AIとの連携」に今週の利用量が % で出る', async ({ page }) => {
		await login(page);
		await gotoHydrated(page, '/settings/connections');
		await expect(page.getByRole('heading', { name: '今週の利用量' })).toBeVisible();

		// seed は読み取り 123/500（24%）・書き込み 7/100（7%）。ほかのテストの呼び出しで数が少し増えてもよい。
		const read = page.getByRole('progressbar', { name: '読み取り' });
		const write = page.getByRole('progressbar', { name: '書き込み' });
		await expect(read).toHaveAttribute('aria-valuenow', /^(2[4-9]|3\d)$/);
		await expect(write).toHaveAttribute('aria-valuenow', /^(7|8|9|1\d)$/);
		const percent = await read.getAttribute('aria-valuenow');
		await expect(page.getByText(`${percent}%`, { exact: true }).first()).toBeVisible();
		await expect(
			page.getByText(/毎週水曜 12:00 に 0% に戻ります（次は \d+月\d+日（水）12:00）。/)
		).toBeVisible();
		await expect(page.getByText('上限に達しました')).toHaveCount(0);
	});

	test('「AIとの連携」に他人の連携は出ず、他人の連携は解除できない', async ({ page, request }) => {
		await login(page);
		await gotoHydrated(page, '/settings/connections');
		await expect(page.getByText('E2E クライアント', { exact: true })).toBeVisible();
		await expect(page.getByText(OTHER_GRANT.clientName)).toHaveCount(0);

		// 他人の grantId を送っても 404。相手のトークンはそのまま使える。
		const res = await page.request.post('/settings/connections?/revoke', {
			form: { grantId: OTHER_GRANT.id },
			headers: { origin: new URL(page.url()).origin },
			maxRedirects: 0
		});
		// Accept が */* なので SvelteKit は action の結果を JSON で返す（失敗は type: 'failure'）。
		expect(await res.json()).toMatchObject({ type: 'failure', status: 404 });
		expect((await mcp(request, MCP_TOKENS.other, rpc('tools/list'))).status()).toBe(200);
	});

	test('入力に user の id を足しても、読む相手は変わらず、要求ごと断る', async ({ request }) => {
		const result = await toolText(
			await callTool(request, MCP_TOKENS.all, 'list_my_recent_notes', {
				viewerId: '01JE2EOTHERUSER00000000000'
			})
		);
		expect(result.isError).toBe(true);
		expect(result.content[0].text).not.toContain(OTHER_USER_PREVIEW_BODY);
	});

	test('レースの一覧の「自分のメモの件数」は自分のぶんだけ', async ({ request }) => {
		const mine = JSON.parse(
			(await toolText(await callTool(request, MCP_TOKENS.all, 'search_races', { q: 'E2E枠色賞' })))
				.content[0].text
		);
		const theirs = JSON.parse(
			(
				await toolText(
					await callTool(request, MCP_TOKENS.other, 'search_races', { q: 'E2E枠色賞' })
				)
			).content[0].text
		);
		// 同じレースでも、数えるのはトークンの持ち主のメモだけ。別のユーザーがこのレースに書いたのは
		// 出走前メモ1本で、自分のメモ（OUTER_PREVIEW_BODY など）を足して数えていない。
		expect(mine.races[0].id).toBe(BRACKET_RACE_ID);
		expect(theirs.races[0].myNoteCount).toBe(1);
	});

	test('自分のメモの件数は、自分のメモの tool が返す本数と同じ（他人のぶんを足さない）', async ({
		request
	}) => {
		// ほかの E2E がこのレースにメモを書くことがあるので、固定の数ではなく、同じときに読んだ本数と比べる。
		// 他人の1本を数えていれば、いつまでたっても1本多く、一致しない。
		const read = async () => {
			const list = JSON.parse(
				(
					await toolText(
						await callTool(request, MCP_TOKENS.all, 'search_races', { q: 'E2E枠色賞' })
					)
				).content[0].text
			);
			const notes = JSON.parse(
				(
					await toolText(
						await callTool(request, MCP_TOKENS.all, 'get_my_race_notes', {
							raceId: BRACKET_RACE_ID
						})
					)
				).content[0].text
			);
			return list.races[0].myNoteCount - notes.notes.length;
		};
		await expect.poll(read).toBe(0);
	});
});

/** PKCE の verifier と challenge（S256）。 */
function pkce() {
	const verifier = randomBytes(32).toString('base64url');
	return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function register(request: APIRequestContext, name: string) {
	const res = await request.post('/oauth/register', {
		data: { client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }
	});
	expect(res.status()).toBe(201);
	return ((await res.json()) as { client_id: string }).client_id;
}

/**
 * 同意画面が返す戻り先（303 の Location）を読む。戻り先には誰も待っていないので、ブラウザはその先で
 * つながらずに止まる（`page.route` はリダイレクトの先を横取りしないので、応答の側で読む）。
 */
function captureCallback(page: Page) {
	return page
		.waitForResponse(
			(r) => new URL(r.url()).pathname === '/oauth/authorize' && [302, 303].includes(r.status())
		)
		.then((r) => new URL(r.headers()['location']));
}

function authorizeUrl(clientId: string, challenge: string, extra: Record<string, string> = {}) {
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: REDIRECT,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state: 'e2e-state',
		...extra
	});
	return `/oauth/authorize?${q}`;
}

async function exchange(
	request: APIRequestContext,
	fields: Record<string, string>
): Promise<{ status: number; json: Record<string, string> }> {
	const res = await request.post('/oauth/token', { form: fields });
	return { status: res.status(), json: await res.json() };
}

/**
 * 登録 → 同意 → コード → トークン。`keepNotes` を外すとメモ（読む・書く）のチェックを外して許可する。
 * `keepWrite` を外すと、予想を書くのチェックだけを外す。`keepReview` を外すと、ふりかえりを書くのチェックだけを外す。
 */
async function connect(
	page: Page,
	request: APIRequestContext,
	keepNotes = true,
	keepWrite = true,
	keepReview = true
) {
	const clientId = await register(request, `E2E フロー ${randomBytes(4).toString('hex')}`);
	const { verifier, challenge } = pkce();
	await login(page);
	const callback = captureCallback(page);
	await gotoHydrated(page, authorizeUrl(clientId, challenge));
	await expect(page.getByRole('heading', { name: 'アプリとの連携を許可しますか' })).toBeVisible();
	if (!keepNotes) await page.getByLabel('あなたのメモ・見立て・印・札を読む').uncheck();
	if (!keepNotes || !keepWrite) await page.getByLabel(WRITE_LABEL).uncheck();
	if (!keepNotes || !keepReview) await page.getByLabel(REVIEW_LABEL).uncheck();
	await page.getByRole('button', { name: '許可する' }).click();
	const url = await callback;
	expect(url.searchParams.get('state')).toBe('e2e-state');
	expect(url.searchParams.get('iss')).toBeTruthy();
	const code = url.searchParams.get('code')!;

	const { status, json } = await exchange(request, {
		grant_type: 'authorization_code',
		code,
		redirect_uri: REDIRECT,
		client_id: clientId,
		code_verifier: verifier
	});
	expect(status).toBe(200);
	return { clientId, code, verifier, tokens: json };
}

test.describe('OAuth の全行程', () => {
	test('縮小した更新を省略で再送してもメモの権限は戻らず、異なる条件は拒否する', async ({
		page,
		request
	}) => {
		const { clientId, tokens } = await connect(page, request);
		const input = {
			grant_type: 'refresh_token',
			refresh_token: tokens.refresh_token,
			client_id: clientId
		};
		const narrowed = await exchange(request, { ...input, scope: 'races:read' });
		expect(narrowed.status).toBe(200);
		const mismatch = await exchange(request, { ...input, scope: 'races:read notes:read' });
		expect(mismatch.status).toBe(400);
		expect(mismatch.json.error).toBe('invalid_scope');
		const retried = await exchange(request, input);
		expect(retried.status).toBe(200);
		expect(retried.json.scope).toBe('races:read');
		expect(
			(await callTool(request, retried.json.access_token, 'list_my_recent_notes')).status()
		).toBe(403);
		expect((await mcp(request, narrowed.json.access_token, rpc('ping'))).status()).toBe(401);
		const updated = await exchange(request, {
			...input,
			refresh_token: retried.json.refresh_token
		});
		expect(updated.status).toBe(200);
		expect(updated.json.scope).toBe('races:read');
		expect(
			(await callTool(request, updated.json.access_token, 'list_my_recent_notes')).status()
		).toBe(403);
	});

	test('メモを外して再同意すると古い連携は失効し、新しいトークンの更新でもメモの権限は戻らない', async ({
		page,
		request
	}) => {
		const { clientId, tokens } = await connect(page, request);
		const consent = await page.context().newPage();
		const { verifier, challenge } = pkce();
		const callback = captureCallback(consent);
		await gotoHydrated(consent, authorizeUrl(clientId, challenge));
		await consent.getByLabel('あなたのメモ・見立て・印・札を読む').uncheck();
		await consent.getByLabel(WRITE_LABEL).uncheck();
		await consent.getByLabel(REVIEW_LABEL).uncheck();
		await consent.getByRole('button', { name: '許可する' }).click();
		const code = (await callback).searchParams.get('code')!;
		expect((await mcp(request, tokens.access_token, rpc('tools/list'))).status()).toBe(401);
		const old = await exchange(request, {
			grant_type: 'refresh_token',
			refresh_token: tokens.refresh_token,
			client_id: clientId
		});
		expect(old.status).toBe(400);
		expect(old.json.error).toBe('invalid_grant');
		const fresh = await exchange(request, {
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: verifier
		});
		expect(fresh.status).toBe(200);
		expect(fresh.json.scope).toBe('races:read');
		const updated = await exchange(request, {
			grant_type: 'refresh_token',
			refresh_token: fresh.json.refresh_token,
			client_id: clientId
		});
		expect(updated.status).toBe(200);
		expect(updated.json.scope).toBe('races:read');
		expect(
			(await callTool(request, updated.json.access_token, 'list_my_recent_notes')).status()
		).toBe(403);
	});

	test('同時更新で失効エラーを返さず、連携と使えるトークンを残す', async ({ page, request }) => {
		const { clientId, tokens } = await connect(page, request);
		const results = await Promise.all(
			Array.from({ length: 4 }, () =>
				exchange(request, {
					grant_type: 'refresh_token',
					refresh_token: tokens.refresh_token,
					client_id: clientId
				})
			)
		);
		const issued = results.filter((r) => r.status === 200);
		expect(issued.length).toBeGreaterThanOrEqual(1);
		for (const result of results.filter((r) => r.status !== 200)) {
			expect(result.status).toBe(503);
			expect(result.json.error).toBe('temporarily_unavailable');
		}
		const alive = [];
		for (const result of issued) {
			if ((await mcp(request, result.json.access_token, rpc('tools/list'))).status() === 200)
				alive.push(result);
		}
		expect(alive).toHaveLength(1);
		const updated = await exchange(request, {
			grant_type: 'refresh_token',
			refresh_token: alive[0].json.refresh_token,
			client_id: clientId
		});
		expect(updated.status).toBe(200);
	});

	test('登録 → 同意 → トークン → tool。コードは2度使えない', async ({ page, request }) => {
		const { clientId, code, verifier, tokens } = await connect(page, request);
		expect(tokens.scope).toBe('races:read notes:read notes:write reviews:write');
		expect(await toolNames(request, tokens.access_token)).toContain('get_my_race_notes');

		const again = await exchange(request, {
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: verifier
		});
		expect(again.status).toBe(400);
		expect(again.json.error).toBe('invalid_grant');
	});

	test('同意でメモのチェックを外すと、メモの tool は呼べない', async ({ page, request }) => {
		const { tokens } = await connect(page, request, false);
		expect(tokens.scope).toBe('races:read');
		const res = await callTool(request, tokens.access_token, 'list_my_recent_notes');
		expect(res.status()).toBe(403);
	});

	test('同意で予想を書くのチェックだけを外すと、読めるが書けない', async ({ page, request }) => {
		const { tokens } = await connect(page, request, true, false);
		// ふりかえりを書くほうは残したままなので、reviews:write は付く。
		expect(tokens.scope).toBe('races:read notes:read reviews:write');
		const names = await toolNames(request, tokens.access_token);
		expect(names).not.toContain('save_my_race_preview');
		expect(names).toContain('save_my_race_review');
		const res = await callTool(request, tokens.access_token, 'save_my_race_preview', {
			raceId: MCP_WRITE_RACE.id,
			raceNote: { body: '書けてはいけない' }
		});
		expect(res.status()).toBe(403);
		expect(res.headers()['www-authenticate']).toContain('scope="notes:write"');
	});

	test('同意でふりかえりを書くのチェックだけを外すと、予想は書けるがふりかえりは書けない', async ({
		page,
		request
	}) => {
		const { tokens } = await connect(page, request, true, true, false);
		expect(tokens.scope).toBe('races:read notes:read notes:write');
		const names = await toolNames(request, tokens.access_token);
		expect(names).toContain('save_my_race_preview');
		expect(names).not.toContain('save_my_race_review');
		const res = await callTool(request, tokens.access_token, 'save_my_race_review', {
			raceId: MCP_REVIEW_RACE.id,
			raceNote: { body: '書けてはいけない' }
		});
		expect(res.status()).toBe(403);
		expect(res.headers()['www-authenticate']).toContain('scope="reviews:write"');
	});

	test('PKCE の verifier が違えばトークンを出さない', async ({ page, request }) => {
		const clientId = await register(request, 'E2E PKCE');
		const { challenge } = pkce();
		await login(page);
		const callback = captureCallback(page);
		await gotoHydrated(page, authorizeUrl(clientId, challenge));
		await page.getByRole('button', { name: '許可する' }).click();
		const code = (await callback).searchParams.get('code')!;
		const { status, json } = await exchange(request, {
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: pkce().verifier
		});
		expect(status).toBe(400);
		expect(json.error).toBe('invalid_grant');
	});

	test('「許可しない」なら access_denied で戻り、コードは出ない', async ({ page, request }) => {
		const clientId = await register(request, 'E2E 拒否');
		await login(page);
		const callback = captureCallback(page);
		await gotoHydrated(page, authorizeUrl(clientId, pkce().challenge));
		await page.getByRole('button', { name: '許可しない' }).click();
		const url = await callback;
		expect(url.searchParams.get('error')).toBe('access_denied');
		expect(url.searchParams.get('code')).toBeNull();
	});

	for (const [what, extra] of [
		['別のサーバー向け（resource が違う）', { resource: 'https://other.example/mcp' }],
		['PKCE が無い', { code_challenge: '' }],
		['response_type が code でない', { response_type: 'token' }]
	] as const) {
		test(`${what}要求は、戻り先へ飛ばさず（オープンリダイレクトにしない）この画面で止める`, async ({
			page,
			request
		}) => {
			// 登録は誰でもでき、戻り先も https ならどこでも登録できる。誤りで戻り先へ飛ばすと、
			// わざと誤った要求を踏ませるだけで、本人が何も押さずに外のサイトへ送れてしまう。
			const clientId = await register(request, 'E2E 誤った要求');
			await login(page);
			const res = await page.request.get(authorizeUrl(clientId, pkce().challenge, extra), {
				maxRedirects: 0
			});
			expect(res.status()).toBe(200);
			expect(await res.text()).toContain('連携を始められません');
		});
	}

	test('未ログインで開いても、ログインのあと同じ要求のまま同意画面に戻る', async ({
		page,
		request
	}) => {
		const clientId = await register(request, 'E2E 未ログイン');
		const { challenge } = pkce();
		const path = authorizeUrl(clientId, challenge);
		await page.goto(path);
		// hooks がクエリごと redirect に入れる。PKCE と state が欠けないこと。
		await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(path)}`);
		const back = new URL(page.url()).searchParams.get('redirect')!;
		expect(back).toBe(path);

		// Google でのログインの代わりに seed のセッションを載せ、ログイン後の行き先へ進む。
		await login(page);
		const callback = captureCallback(page);
		await gotoHydrated(page, back);
		await page.getByRole('button', { name: '許可する' }).click();
		const url = await callback;
		expect(url.searchParams.get('code')).toBeTruthy();
		expect(url.searchParams.get('state')).toBe('e2e-state');
	});

	test('登録と違う戻り先には飛ばさず、この画面で止める', async ({ page, request }) => {
		const clientId = await register(request, 'E2E 戻り先');
		await login(page);
		await gotoHydrated(
			page,
			authorizeUrl(clientId, pkce().challenge, { redirect_uri: 'https://evil.example/cb' })
		);
		await expect(page).toHaveURL(/\/oauth\/authorize/);
		await expect(page.getByRole('heading', { name: '連携を始められません' })).toBeVisible();
		await expect(page.getByRole('button', { name: '許可する' })).toHaveCount(0);
	});

	test('同意画面は他サイトの枠に入れられない', async ({ page, request }) => {
		const clientId = await register(request, 'E2E 枠');
		await login(page);
		const res = await page.goto(authorizeUrl(clientId, pkce().challenge));
		expect(res?.headers()['x-frame-options']).toBe('DENY');
		expect(res?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
	});

	test('回線断で応答が届かず同じリフレッシュトークンを送り直しても、連携は切れずに使い続けられる', async ({
		page,
		request
	}) => {
		// 競馬場のように電波の弱い所では、要求は届いたのに応答が届かないことがある。
		const { clientId, tokens } = await connect(page, request);
		const refresh = {
			grant_type: 'refresh_token',
			refresh_token: tokens.refresh_token,
			client_id: clientId
		};
		const lost = await exchange(request, refresh); // クライアントには届かなかった応答
		expect(lost.status).toBe(200);
		const retried = await exchange(request, refresh);
		expect(retried.status).toBe(200);

		expect((await mcp(request, retried.json.access_token, rpc('tools/list'))).status()).toBe(200);
		// 届かなかった1組は止まっている（持っていないはずのものが使われないように）。
		expect((await mcp(request, lost.json.access_token, rpc('tools/list'))).status()).toBe(401);
		// 送り直しのあとも更新を続けられる。
		const next = await exchange(request, {
			...refresh,
			refresh_token: retried.json.refresh_token
		});
		expect(next.status).toBe(200);
	});

	test('新しいアクセストークンを使ったあとで古いリフレッシュトークンが来たら（盗まれた）、30分の内でも連携ごと止まる', async ({
		page,
		request
	}) => {
		const { clientId, tokens } = await connect(page, request);
		const refresh = { grant_type: 'refresh_token', client_id: clientId };
		const first = await exchange(request, { ...refresh, refresh_token: tokens.refresh_token });
		// 応答を受け取った正規のクライアントは、新しいアクセストークンですぐ tool を呼ぶ。
		expect((await mcp(request, first.json.access_token, rpc('tools/list'))).status()).toBe(200);

		const stolen = await exchange(request, { ...refresh, refresh_token: tokens.refresh_token });
		expect(stolen.json.error).toBe('invalid_grant');
		expect((await mcp(request, first.json.access_token, rpc('tools/list'))).status()).toBe(401);
	});

	test('次のトークンを使ったあとで古いリフレッシュトークンが来たら（盗まれた）、連携ごと止まる', async ({
		page,
		request
	}) => {
		const { clientId, tokens } = await connect(page, request);
		const refresh = { grant_type: 'refresh_token', client_id: clientId };
		const first = await exchange(request, { ...refresh, refresh_token: tokens.refresh_token });
		// 正規のクライアントは次のトークンを受け取り、使った。
		const second = await exchange(request, {
			...refresh,
			refresh_token: first.json.refresh_token
		});
		expect(second.status).toBe(200);
		expect((await mcp(request, second.json.access_token, rpc('tools/list'))).status()).toBe(200);

		const reused = await exchange(request, { ...refresh, refresh_token: tokens.refresh_token });
		expect(reused.json.error).toBe('invalid_grant');
		expect((await mcp(request, second.json.access_token, rpc('tools/list'))).status()).toBe(401);
	});

	test('「AIとの連携」で解除すると、そのトークンはすぐ通らない', async ({ page, request }) => {
		const name = `E2E 解除 ${randomBytes(4).toString('hex')}`;
		const clientId = await register(request, name);
		const { verifier, challenge } = pkce();
		await login(page);
		const callback = captureCallback(page);
		await gotoHydrated(page, authorizeUrl(clientId, challenge));
		await page.getByRole('button', { name: '許可する' }).click();
		const code = (await callback).searchParams.get('code')!;
		const { json } = await exchange(request, {
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: verifier
		});
		expect((await mcp(request, json.access_token, rpc('tools/list'))).status()).toBe(200);

		// 元のタブは戻り先（誰も待っていない）へ移ろうとしているので、別のタブで開く。
		const settings = await page.context().newPage();
		await gotoHydrated(settings, '/settings/connections');
		const item = settings.getByRole('listitem').filter({ hasText: name });
		await item.getByRole('button', { name: '連携を解除' }).click();
		await expect(settings.getByText(name)).toHaveCount(0);

		expect((await mcp(request, json.access_token, rpc('tools/list'))).status()).toBe(401);
	});
});

test('登録は https とループバックの戻り先だけ', async ({ request }) => {
	const res = await request.post('/oauth/register', {
		data: { client_name: 'evil', redirect_uris: ['http://evil.example/cb'] }
	});
	expect(res.status()).toBe(400);
	expect((await res.json()).error).toBe('invalid_redirect_uri');
});

test('トークンの口は Origin の無いフォームの POST を受ける（CSRF の検査で落とさない）', async ({
	request
}) => {
	// Claude・ChatGPT のサーバーからの要求と同じ形。SvelteKit に回ると 403 になる。
	const res = await request.post('/oauth/token', {
		form: { grant_type: 'authorization_code', code: 'x' },
		headers: { cookie: `session=${SESSION_TOKEN}` }
	});
	expect(res.status()).toBe(400);
	expect((await res.json()).error).toBe('invalid_request');
});

test('登録の案内は「AIとの連携」から開け、接続先の URL と Claude・ChatGPT の手順を出す', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, '/settings/connections');
	await page.getByRole('link', { name: 'AIとの連携の始め方（Claude・ChatGPT での手順）' }).click();
	await expect(page).toHaveURL('/help/mcp');
	await expect(page.getByRole('heading', { level: 1, name: 'AIとの連携の始め方' })).toBeVisible();
	// 接続先は /mcp。登録に使う URL をそのまま写せること。
	const mcpUrl = (await page.getByText(/^https?:\/\/[^\s]+\/mcp$/).textContent())!.trim();
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: 'URL をコピー' }).click();
	await expect(page.getByText('接続先の URL をコピーしました')).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(mcpUrl);
	await expect(page.getByRole('heading', { name: 'Claude に追加する' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'ChatGPT に追加する' })).toBeVisible();
	// Claude の推奨の方式（Client ID Metadata Document）に対応したので、推奨のままでよいと案内している。
	await expect(page.getByText("「Use Claude's published identity」").first()).toBeVisible();
});

/**
 * Client ID Metadata Document（Claude の推奨の方式）。テストが手元に立てたサーバーに文書を置き、
 * Worker に取りに行かせる。本番は https だけだが、E2E は OAUTH_CIMD_ALLOW_LOOPBACK=1（playwright.config.ts）で
 * http://localhost を許している。
 */
test.describe('Client ID Metadata Document', () => {
	let server: Server;
	let base = '';
	const served = new Map<string, unknown>();

	test.beforeAll(async () => {
		server = createServer((req, res) => {
			const body = served.get(req.url ?? '');
			if (!body) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
		});
		await new Promise<void>((r) => server.listen(0, r));
		base = `http://localhost:${(server.address() as AddressInfo).port}`;
	});
	test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

	/** 文書を置いて、その URL（＝client_id）を返す。テストごとに別のパスにする（並列で走るため）。 */
	function publish(over: Record<string, unknown> = {}) {
		const path = `/client-${randomBytes(4).toString('hex')}.json`;
		const clientId = `${base}${path}`;
		served.set(path, {
			client_id: clientId,
			client_name: 'E2E メタデータのアプリ',
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: 'none',
			...over
		});
		return clientId;
	}

	test('案内（メタデータ）が対応を示す', async ({ request }) => {
		const as = await (await request.get('/.well-known/oauth-authorization-server')).json();
		expect(as.client_id_metadata_document_supported).toBe(true);
	});

	test('登録なしで、文書の URL を client_id にして同意 → トークン → tool まで通る', async ({
		page,
		request
	}) => {
		const clientId = publish();
		const { verifier, challenge } = pkce();
		await login(page);
		const callback = captureCallback(page);
		await gotoHydrated(page, authorizeUrl(clientId, challenge));
		await expect(page.getByText('E2E メタデータのアプリ')).toBeVisible();
		// 名前は自己申告だが、提供元は文書を置いたアドレスで確かめたもの。
		await expect(page.getByText(`提供元: ${new URL(clientId).host}`)).toBeVisible();
		await page.getByRole('button', { name: '許可する' }).click();
		const code = (await callback).searchParams.get('code')!;

		const { status, json } = await exchange(request, {
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: verifier
		});
		expect(status).toBe(200);
		expect((await mcp(request, json.access_token, rpc('tools/list'))).status()).toBe(200);

		// 別の client_id（動的登録のもの）でこのコードやトークンは使えない。
		const other = await exchange(request, {
			grant_type: 'refresh_token',
			refresh_token: json.refresh_token,
			client_id: await register(request, 'E2E 別')
		});
		expect(other.json.error).toBe('invalid_grant');
	});

	for (const [what, over] of [
		[
			'文書の client_id が URL と違う（別のクライアントの文書を指させない）',
			{ client_id: 'https://evil.example/c.json' }
		],
		['要求の戻り先が文書に無い', { redirect_uris: ['https://other.example/cb'] }]
	] as const) {
		test(`${what}なら、同意画面で止めて戻り先へ飛ばさない`, async ({ page }) => {
			const clientId = publish(over);
			await login(page);
			await gotoHydrated(page, authorizeUrl(clientId, pkce().challenge));
			await expect(page.getByRole('heading', { name: '連携を始められません' })).toBeVisible();
			await expect(page.getByRole('button', { name: '許可する' })).toHaveCount(0);
		});
	}

	test('文書が無い（404）なら、同意画面で止める', async ({ page }) => {
		await login(page);
		await gotoHydrated(page, authorizeUrl(`${base}/missing.json`, pkce().challenge));
		await expect(page.getByRole('heading', { name: '連携を始められません' })).toBeVisible();
	});
});

test('「AIとの連携」では、CIMD のクライアントに提供元を出し、動的登録のクライアントには出さない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, '/settings/connections');
	const metadata = page.getByRole('listitem').filter({ hasText: 'E2E メタデータのクライアント' });
	await expect(metadata.getByText('提供元: client.example')).toBeVisible();
	const registered = page.getByRole('listitem').filter({ hasText: 'E2E 読むだけのクライアント' });
	await expect(registered.getByText(/提供元/)).toHaveCount(0);
});
