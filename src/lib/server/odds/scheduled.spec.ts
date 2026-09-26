import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOddsRunRequest, relayOddsCron } from './scheduled';

// 2026-09-26T03:00:49Z（JST 12:00 の回）
const SCHEDULED = 1790391649000;

const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
const baseEnv = { APP_ENV: 'production' as const, DISCORD_WEBHOOK_URL: undefined };

function env(fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
	return { ...baseEnv, SELF: { fetch: vi.fn(fetch) } };
}

/** `writeLog` が console に出した構造化ログを拾う。 */
function captureLogs() {
	const lines: Array<Record<string, unknown>> = [];
	const record = (entry: Record<string, unknown>) => lines.push(entry);
	for (const level of ['log', 'info', 'warn', 'error'] as const) {
		vi.spyOn(console, level).mockImplementation(record);
	}
	return lines;
}

afterEach(() => vi.restoreAllMocks());

describe('relayOddsCron', () => {
	it('自分の fetch に、Cron の起動時刻を付けて渡す', async () => {
		const e = env(async () => new Response(null, { status: 204 }));
		const logs = captureLogs();

		await relayOddsCron(e, ctx, SCHEDULED);

		expect(e.SELF.fetch).toHaveBeenCalledTimes(1);
		const [input, init] = e.SELF.fetch.mock.calls[0];
		const req = new Request(input, init);
		expect(isOddsRunRequest(req)).toBe(true);
		expect(req.headers.get('x-scheduled-time')).toBe(String(SCHEDULED));
		expect(logs).toEqual([]);
	});

	it('渡した先が失敗を返したら odds.cron.failed を出す', async () => {
		const e = env(async () => new Response(null, { status: 500 }));
		const logs = captureLogs();

		await relayOddsCron(e, ctx, SCHEDULED);

		expect(logs).toMatchObject([
			{
				level: 'error',
				event: 'odds.cron.failed',
				requestId: 'cron-odds-2026-09-26T03:00:49.000Z'
			}
		]);
	});

	it('渡せなかった（投げた）ときも odds.cron.failed を出し、Cron は落とさない', async () => {
		const e = env(async () => {
			throw new Error('binding がない');
		});
		const logs = captureLogs();

		await expect(relayOddsCron(e, ctx, SCHEDULED)).resolves.toBeUndefined();

		expect(logs).toMatchObject([{ level: 'error', event: 'odds.cron.failed' }]);
	});
});

describe('isOddsRunRequest', () => {
	const post = (url: string) => new Request(url, { method: 'POST' });

	it('外から届くホスト名では true にならない', () => {
		expect(isOddsRunRequest(post('https://uma-memo.com/run'))).toBe(false);
		expect(isOddsRunRequest(post('https://k-note.example.workers.dev/run'))).toBe(false);
	});

	it('宛先のホスト名でも、POST 以外・別のパスは受けない', () => {
		expect(isOddsRunRequest(new Request('https://odds-cron.internal/run'))).toBe(false);
		expect(isOddsRunRequest(post('https://odds-cron.internal/other'))).toBe(false);
	});
});
