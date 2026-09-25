import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { DispatchError, type EntriesFetchRequest } from './dispatch';
import { requestEntriesFetch, type EntriesLogEntry } from './request';
import { ENTRIES_CRON } from './scheduled';

let db: Db;
let sqlite: DatabaseSync;

// 2026-09-24（木）12:00 JST
const NOW = new Date('2026-09-24T03:00:00Z');

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, grade, external_ref) VALUES
		('SAT', '2026-09-26', '阪神', 11, '土曜の重賞', 'G2', NULL),
		('SPR', '2026-09-27', '中山', 11, 'スプリンターズS', 'G1', 'nk-202606040911')`);
});

function run(dispatch: (req: EntriesFetchRequest) => Promise<void>) {
	const logs: EntriesLogEntry[] = [];
	const spy = vi.fn(dispatch);
	const summary = requestEntriesFetch({
		db,
		dispatch: spy,
		log: (e) => logs.push(e),
		now: () => NOW
	});
	return { summary, logs, spy };
}

describe('requestEntriesFetch', () => {
	it('枠順を待っているレースを1つずつ、確定待ちとして頼む', async () => {
		const { summary, logs, spy } = run(async () => {});

		expect(await summary).toEqual({ targets: 2, requested: 2, failed: 0, stopped: false });
		expect(spy.mock.calls.map((c) => c[0])).toEqual([
			{
				date: '2026-09-26',
				course: '阪神',
				raceNumber: 11,
				externalRef: null,
				requireConfirmed: true,
				trigger: 'cron'
			},
			{
				date: '2026-09-27',
				course: '中山',
				raceNumber: 11,
				externalRef: 'nk-202606040911',
				requireConfirmed: true,
				trigger: 'cron'
			}
		]);
		expect(logs[0]).toMatchObject({ level: 'info', event: 'entries.dispatch', raceId: 'SAT' });
	});

	it('一時的に届かなかったレースは飛ばして次へ進み、通知しない', async () => {
		const { summary, logs } = run(
			vi
				.fn()
				.mockRejectedValueOnce(new DispatchError('network', 'x'))
				.mockResolvedValueOnce(undefined)
		);
		expect(await summary).toMatchObject({ requested: 1, failed: 1, stopped: false });
		expect(logs[0]).toMatchObject({ level: 'warn', notify: false, errorType: 'network' });
	});

	it.each(['not-configured', 'auth', 'rate-limited'] as const)(
		'%s は残りも同じ理由で落ちるので、そこでやめて知らせる',
		async (kind) => {
			const { summary, logs, spy } = run(async () => {
				throw new DispatchError(kind, 'x');
			});
			expect(await summary).toMatchObject({ targets: 2, requested: 0, failed: 1, stopped: true });
			expect(spy).toHaveBeenCalledTimes(1);
			// warn でも notify: true、error は既定で通知される
			expect(logs[0].level === 'error' || logs[0].notify === true).toBe(true);
		}
	);

	it('対象が無ければ GitHub には行かない', async () => {
		sqlite.exec(`DELETE FROM race`);
		const { summary, spy } = run(async () => {});
		expect((await summary).targets).toBe(0);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('ENTRIES_CRON', () => {
	// worker.js はこの文字列で Cron を出し分ける。wrangler.toml とずれると、オッズの処理が走るだけになる。
	it('wrangler.toml の crons に同じ文字列で入っている', () => {
		const toml = readFileSync('wrangler.toml', 'utf8');
		const crons = /^crons\s*=\s*\[(.*)\]$/m.exec(toml)?.[1] ?? '';
		expect(crons).toContain(`"${ENTRIES_CRON}"`);
	});
});
