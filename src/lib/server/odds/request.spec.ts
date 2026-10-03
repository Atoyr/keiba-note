import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { DispatchError } from '$lib/server/race-data/dispatch';
import { requestOddsUpdate, type OddsLogEntry } from './request';
import { ODDS_CRONS } from './scheduled';

let db: Db;
let sqlite: DatabaseSync;

// 2026-09-26（土）12:00 JST。翌日の G1 は前々日の 18:30 から取りに行く時間帯に入っている
const NOW = new Date('2026-09-26T03:00:00Z');

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, grade, start_time, external_ref) VALUES
		('SPR', '2026-09-27', '中山', 11, 'スプリンターズS', 'G1', '15:40', 'nk-202606040911')`);
});

function run(dispatch: () => Promise<void>) {
	const logs: OddsLogEntry[] = [];
	const spy = vi.fn(dispatch);
	const summary = requestOddsUpdate({
		db,
		dispatch: spy,
		log: (e) => logs.push(e),
		now: () => NOW
	});
	return { summary, logs, spy };
}

describe('requestOddsUpdate', () => {
	it('時間帯に入った重賞があれば、ワークフローを1回だけ起動する', async () => {
		sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, grade, start_time, external_ref) VALUES
			('KOB', '2026-09-26', '阪神', 11, '土曜の G3', 'G3', '15:30', 'nk-202609040811')`);
		const { summary, logs, spy } = run(async () => {});

		expect(await summary).toEqual({ targets: 2, requested: true });
		expect(spy).toHaveBeenCalledTimes(1);
		expect(logs).toEqual([
			expect.objectContaining({
				level: 'info',
				event: 'odds.dispatch',
				raceIds: ['KOB', 'SPR'],
				success: true
			})
		]);
	});

	it('対象が無ければ GitHub には行かず、ログも出さない', async () => {
		// 2026-09-25（金）18:00 JST。G1 の時間帯（18:30 から）の前
		const logs: OddsLogEntry[] = [];
		const dispatch = vi.fn(async () => {});
		const summary = await requestOddsUpdate({
			db,
			dispatch,
			log: (e) => logs.push(e),
			now: () => new Date('2026-09-25T09:00:00Z')
		});

		expect(summary).toEqual({ targets: 0, requested: false });
		expect(dispatch).not.toHaveBeenCalled();
		expect(logs).toEqual([]);
	});

	it('一時的に届かなかったときは通知しない（30分後の回でまた頼む）', async () => {
		const { summary, logs } = run(async () => {
			throw new DispatchError('network', 'x');
		});
		expect(await summary).toEqual({ targets: 1, requested: false });
		expect(logs[0]).toMatchObject({ level: 'warn', notify: false, errorType: 'network' });
	});

	it.each(['not-configured', 'auth', 'rate-limited', 'http'] as const)(
		'%s は人の手が要るので知らせる',
		async (kind) => {
			const { summary, logs } = run(async () => {
				throw new DispatchError(kind, 'x');
			});
			expect(await summary).toEqual({ targets: 1, requested: false });
			// warn でも notify: true、error は既定で通知される
			expect(logs[0].level === 'error' || logs[0].notify === true).toBe(true);
			expect(logs[0]).toMatchObject({ dedupeKey: `odds.dispatch:${kind}`, success: false });
		}
	);
});

describe('ODDS_CRONS', () => {
	// worker.js はこの文字列で Cron を出し分ける。wrangler.toml とずれると、オッズの更新が頼まれなくなる。
	it('wrangler.toml の crons に同じ文字列で入っている', () => {
		const toml = readFileSync('wrangler.toml', 'utf8');
		const crons = /^crons\s*=\s*\[(.*)\]$/m.exec(toml)?.[1] ?? '';
		for (const cron of ODDS_CRONS) expect(crons).toContain(`"${cron}"`);
	});
});
