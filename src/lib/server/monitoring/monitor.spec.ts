import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertThrottle } from './throttle';
import { classifyQuery, createMonitor, type MonitorOptions } from './monitor';

const WEBHOOK = 'https://discord.com/api/webhooks/123/secret-token';

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

function setup(over: Partial<MonitorOptions> = {}) {
	const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
	const tasks: Promise<unknown>[] = [];
	const throttle = new AlertThrottle(60_000);
	const make = (more: Partial<MonitorOptions> = {}) =>
		createMonitor({
			requestId: 'req-1',
			environment: 'production',
			webhookUrl: WEBHOOK,
			waitUntil: (t) => tasks.push(t),
			throttle,
			fetchFn,
			...over,
			...more
		});
	return { monitor: make(), make, fetchFn, tasks };
}

const sentBodies = (fetchFn: ReturnType<typeof setup>['fetchFn']) =>
	fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

describe('createMonitor().log', () => {
	it('error はログに出し、Discord への送信を waitUntil に載せる', async () => {
		const { monitor, fetchFn, tasks } = setup();

		monitor.log({ level: 'error', event: 'request.unhandled', message: '落ちた', route: '/races' });
		await Promise.all(tasks);

		expect(console.error).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'request.unhandled', requestId: 'req-1' })
		);
		expect(tasks).toHaveLength(1);
		const [body] = sentBodies(fetchFn);
		expect(body.embeds[0].fields).toContainEqual({ name: 'route', value: '```\n/races\n```' });
	});

	it('warn は既定では送らない。notify: true を付けたものだけ送る', () => {
		const { make, fetchFn } = setup();

		make().log({ level: 'warn', event: 'd1.query.slow', message: '遅い' });
		expect(fetchFn).not.toHaveBeenCalled();

		make().log({ level: 'warn', event: 'retry.happened', message: '要対応', notify: true });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('info は notify を付けても送らない', () => {
		const { monitor, fetchFn } = setup();

		monitor.log({ level: 'info', event: 'x', message: 'y', notify: true });

		expect(fetchFn).not.toHaveBeenCalled();
		expect(console.log).toHaveBeenCalled();
	});

	it('Webhook が無ければ（ローカル・E2E）ログだけ出して送らない', () => {
		const { monitor, fetchFn } = setup({ webhookUrl: undefined });

		monitor.log({ level: 'error', event: 'x', message: 'y' });

		expect(console.error).toHaveBeenCalled();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('1リクエストで送るのは最初の1件だけ（D1 の失敗に続く 500 は送らない）', () => {
		const { monitor, fetchFn } = setup();

		monitor.log({ level: 'error', event: 'd1.query.failed', message: 'a' });
		monitor.log({ level: 'error', event: 'request.unhandled', message: 'b' });

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(console.error).toHaveBeenCalledTimes(2);
	});

	it('別のリクエストでも、同じ event は窓のあいだ抑える', () => {
		const { make, fetchFn } = setup();

		make().log({ level: 'error', event: 'd1.query.failed', message: 'a' });
		make().log({ level: 'error', event: 'd1.query.failed', message: 'a' });
		make().log({ level: 'error', event: 'request.unhandled', message: 'b' });

		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('送信の結果を待たずに戻る（waitUntil が無くても投げない）', () => {
		const { monitor } = setup({ waitUntil: undefined });

		expect(() => monitor.log({ level: 'error', event: 'x', message: 'y' })).not.toThrow();
	});

	it('通知に stack は載せない（ログには残す）', () => {
		const { monitor, fetchFn } = setup();

		monitor.log({
			level: 'error',
			event: 'x',
			message: 'y',
			error: { name: 'Error', message: 'm', stack: 'Error: m\n    at secretPlace' }
		});

		expect(JSON.stringify(sentBodies(fetchFn))).not.toContain('secretPlace');
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain('secretPlace');
	});
});

describe('classifyQuery', () => {
	const base = { sql: 'select 1', kind: 'statement' as const };

	it('速く成功したクエリは何も出さない', () => {
		expect(classifyQuery({ ...base, durationMs: 12 }, 500)).toBeNull();
	});

	it('閾値以上かかったら d1.query.slow（warn・通知しない）', () => {
		const entry = classifyQuery({ ...base, durationMs: 820.4 }, 500);

		expect(entry).toMatchObject({ level: 'warn', event: 'd1.query.slow', durationMs: 820 });
		expect(entry?.notify).toBeUndefined();
	});

	it('失敗は d1.query.failed（error）', () => {
		const entry = classifyQuery(
			{ ...base, durationMs: 3, error: new Error('D1_ERROR: Network connection lost.') },
			500
		);

		expect(entry).toMatchObject({ level: 'error', event: 'd1.query.failed', sql: 'select 1' });
	});

	it('UNIQUE / CHECK 違反は d1.query.constraint（warn）。ルートが 409 に振り替える想定', () => {
		const unique = classifyQuery(
			{ ...base, durationMs: 3, error: new Error('D1_ERROR: UNIQUE constraint failed: race.x') },
			500
		);
		const check = classifyQuery(
			{ ...base, durationMs: 3, error: new Error('D1_ERROR: CHECK constraint failed: kind') },
			500
		);

		expect(unique).toMatchObject({ level: 'warn', event: 'd1.query.constraint' });
		expect(check).toMatchObject({ level: 'warn', event: 'd1.query.constraint' });
	});

	it('長い SQL（batch）は頭だけ', () => {
		const entry = classifyQuery({ sql: 'x'.repeat(1000), kind: 'batch', durationMs: 900 }, 500);

		expect(String(entry?.sql).length).toBeLessThanOrEqual(301);
	});
});

describe('createMonitor().onQuery', () => {
	it('D1 の失敗をそのまま通知まで流す', () => {
		const { monitor, fetchFn } = setup();

		monitor.onQuery({ sql: 'select 1', kind: 'statement', durationMs: 5, error: new Error('x') });

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(sentBodies(fetchFn))).toContain('d1.query.failed');
	});
});
