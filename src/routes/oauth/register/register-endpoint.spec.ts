import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { CLIENT_REGISTRATION_LIMIT } from '$lib/server/auth/oauth';
import { POST } from './+server';

vi.mock('$lib/server/db', () => ({ createDb: vi.fn() }));

beforeEach(() => {
	vi.mocked(createDb).mockReturnValue(createTestDb().db);
});

const post = () =>
	POST({
		request: new Request('https://uma-memo.test/oauth/register', {
			method: 'POST',
			body: JSON.stringify({
				client_name: 'Test',
				redirect_uris: ['https://example.invalid/callback']
			})
		}),
		platform: { env: { DB: {} } },
		locals: { monitor: { onQuery: vi.fn() } }
	} as unknown as Parameters<typeof POST>[0]);

describe('登録の制限応答', () => {
	it('上限では 429 と再試行間隔を返す', async () => {
		for (let i = 0; i < CLIENT_REGISTRATION_LIMIT; i++) expect((await post()).status).toBe(201);
		const response = await post();
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('60');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toMatchObject({ error: 'temporarily_unavailable' });
	});

	it('DB障害を登録上限の扱いに変えない', async () => {
		// select/delete などは本物を使い、batch の失敗だけを注入する。
		const db = createTestDb().db;
		vi.spyOn(db, 'batch').mockRejectedValueOnce(new Error('database unavailable'));
		vi.mocked(createDb).mockReturnValue(db);
		await expect(post()).rejects.toThrow('database unavailable');
	});
});
