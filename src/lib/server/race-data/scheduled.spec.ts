import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { createDb } from '$lib/server/db';
import { dispatchEntriesFetch } from './dispatch';
import { createMonitor } from '$lib/server/monitoring/monitor';
import { runResultsCron } from './scheduled';

vi.mock('$lib/server/db', () => ({ createDb: vi.fn() }));
vi.mock('./dispatch', async (original) => ({
	...(await original<typeof import('./dispatch')>()),
	dispatchEntriesFetch: vi.fn()
}));
vi.mock('$lib/server/monitoring/monitor', () => ({ createMonitor: vi.fn() }));

const log = vi.fn();
const env = {
	APP_ENV: 'production',
	GITHUB_DISPATCH_TOKEN: 'test-token',
	GITHUB_REPOSITORY: 'Atoyr/keiba-note'
} as App.Platform['env'];
const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
const scheduledTime = Date.parse('2026-10-04T09:10:00Z');

beforeEach(() => {
	vi.clearAllMocks();
	const { db, sqlite } = createTestDb();
	sqlite.exec(`INSERT INTO horse (id, name) VALUES ('H', 'ホースA');
	INSERT INTO race (id, date, course, race_number) VALUES ('R', '2026-10-04', '東京', 11);
	INSERT INTO race_entry (id, race_id, horse_id) VALUES ('E', 'R', 'H');`);
	vi.mocked(createDb).mockReturnValue(db);
	vi.mocked(createMonitor).mockReturnValue({ requestId: 'test', log, onQuery: vi.fn() });
	vi.mocked(dispatchEntriesFetch).mockResolvedValue(undefined);
});

describe('runResultsCron', () => {
	it('実行が遅れても scheduledTime の開催日で、設定されたリポジトリへ依頼する', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
		try {
			await runResultsCron(env, ctx, scheduledTime);
			expect(dispatchEntriesFetch).toHaveBeenCalledWith(
				{ token: 'test-token', repository: 'Atoyr/keiba-note' },
				expect.objectContaining({ date: '2026-10-04', command: 'result' })
			);
			expect(log).toHaveBeenCalledWith(
				expect.objectContaining({ event: 'results.cron', requested: 1 })
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('D1 から対象を選べなければエラーログを出し、Actions を起動しない', async () => {
		vi.mocked(createDb).mockImplementationOnce(() => {
			throw new Error('D1 unavailable');
		});
		await runResultsCron(env, ctx, scheduledTime);
		expect(dispatchEntriesFetch).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({ level: 'error', event: 'results.cron.failed' })
		);
	});
});
