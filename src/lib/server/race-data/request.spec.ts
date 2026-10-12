import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { DispatchError, type EntriesFetchRequest } from './dispatch';
import { requestEntriesFetch, requestResultsFetch, type EntriesLogEntry } from './request';
import { ODDS_CRONS } from '$lib/server/odds/scheduled';
import type { EntriesStage } from '$lib/server/services/entries-fetch';
import { ENTRIES_CRONS, RESULTS_CRON, entriesStageOf } from './scheduled';

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

function run(
	dispatch: (req: EntriesFetchRequest) => Promise<void>,
	stage: EntriesStage = 'frames',
	now: Date = NOW
) {
	const logs: EntriesLogEntry[] = [];
	const spy = vi.fn(dispatch);
	const summary = requestEntriesFetch({
		db,
		dispatch: spy,
		log: (e) => logs.push(e),
		stage,
		now: () => now
	});
	return { summary, logs, spy };
}

describe('requestEntriesFetch', () => {
	it('枠順を待っているレースを1つずつ、確定待ちとして頼む', async () => {
		const { summary, logs, spy } = run(async () => {});

		expect(await summary).toEqual({
			targets: 2,
			requested: 2,
			failed: 0,
			stopped: false
		});
		expect(spy.mock.calls.map((c) => c[0])).toEqual([
			{
				date: '2026-09-26',
				course: '阪神',
				raceNumber: 11,
				externalRef: null,
				requireConfirmed: true,
				trigger: 'cron',
				stage: 'frames'
			},
			{
				date: '2026-09-27',
				course: '中山',
				raceNumber: 11,
				externalRef: 'nk-202606040911',
				requireConfirmed: true,
				trigger: 'cron',
				stage: 'frames'
			}
		]);
		expect(logs[0]).toMatchObject({
			level: 'info',
			event: 'entries.dispatch',
			raceId: 'SAT',
			stage: 'frames'
		});
	});

	it.each(['candidates', 'entries'] as const)('%s は確定待ちにしない', async (stage) => {
		const { summary, spy } = run(async () => {}, stage);
		await summary;
		expect(spy.mock.calls.length).toBeGreaterThan(0);
		for (const [req] of spy.mock.calls) {
			expect(req).toMatchObject({ requireConfirmed: false, stage });
		}
	});

	it('一時的に届かなかったレースは飛ばして次へ進み、通知する', async () => {
		const { summary, logs } = run(
			vi
				.fn()
				.mockRejectedValueOnce(new DispatchError('network', 'x'))
				.mockResolvedValueOnce(undefined)
		);
		expect(await summary).toMatchObject({ requested: 1, failed: 1, stopped: false });
		expect(logs[0]).toMatchObject({ level: 'warn', notify: true, errorType: 'network' });
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

describe('requestResultsFetch', () => {
	// 2026-09-27（日）18:10 JST
	const RESULT_NOW = new Date('2026-09-27T09:10:00Z');

	beforeEach(() => {
		sqlite.exec(`INSERT INTO horse (id, name) VALUES ('H1', 'ホースA');
		INSERT INTO race (id, date, course, race_number, name, grade, external_ref) VALUES
			('COND', '2026-09-27', '阪神', 5, '条件戦', NULL, NULL);
		INSERT INTO race_entry (id, race_id, horse_id) VALUES ('E1', 'SPR', 'H1'), ('E2', 'COND', 'H1');`);
	});

	function runResults(dispatch: (req: EntriesFetchRequest) => Promise<void>) {
		const logs: EntriesLogEntry[] = [];
		const spy = vi.fn(dispatch);
		const summary = requestResultsFetch({
			db,
			dispatch: spy,
			log: (e) => logs.push(e),
			now: () => RESULT_NOW
		});
		return { summary, logs, spy };
	}

	it('当日の出走馬があるレースを、command: result・確定待ちなし・段なしで頼む', async () => {
		const { summary, logs, spy } = runResults(async () => {});
		expect(await summary).toEqual({ targets: 2, requested: 2, failed: 0, stopped: false });
		expect(spy.mock.calls.map((c) => c[0])).toEqual([
			{
				date: '2026-09-27',
				course: '中山',
				raceNumber: 11,
				externalRef: 'nk-202606040911',
				requireConfirmed: false,
				trigger: 'cron',
				command: 'result'
			},
			{
				date: '2026-09-27',
				course: '阪神',
				raceNumber: 5,
				externalRef: null,
				requireConfirmed: false,
				trigger: 'cron',
				command: 'result'
			}
		]);
		expect(logs).toHaveLength(2);
		expect(logs[0]).toMatchObject({ level: 'info', event: 'results.dispatch', raceId: 'SPR' });
		expect(logs[0]).not.toHaveProperty('stage');
	});

	it('頼めなかったレースはレースごとには通知せず、最後にまとめて1件で知らせる', async () => {
		const { summary, logs } = runResults(
			vi.fn().mockRejectedValue(new DispatchError('network', 'x'))
		);
		expect(await summary).toMatchObject({ requested: 0, failed: 2, stopped: false });
		expect(logs.slice(0, 2).every((l) => l.notify === false)).toBe(true);
		expect(logs[2]).toMatchObject({
			level: 'error',
			event: 'results.dispatch.missed',
			races: ['2026-09-27 中山11R', '2026-09-27 阪神5R']
		});
		expect(logs[2].message).toContain('2026-09-27 中山11R・2026-09-27 阪神5R');
		expect(logs[2].message).toContain('command: result');
	});

	it('途中でやめたら、頼まずに残したレースもまとめの知らせに入れる', async () => {
		const { summary, logs, spy } = runResults(async () => {
			throw new DispatchError('auth', 'x');
		});
		expect(await summary).toMatchObject({ requested: 0, failed: 1, stopped: true });
		expect(spy).toHaveBeenCalledTimes(1);
		expect(logs[0]).toMatchObject({ errorType: 'auth', notify: false });
		expect(logs[0].message).not.toContain('出走馬');
		expect(logs.at(-1)).toMatchObject({
			event: 'results.dispatch.missed',
			races: ['2026-09-27 中山11R', '2026-09-27 阪神5R']
		});
	});

	it('全部頼めたら、まとめの知らせは出さない', async () => {
		const { summary, logs } = runResults(async () => {});
		await summary;
		expect(logs.some((l) => l.event === 'results.dispatch.missed')).toBe(false);
	});
});

describe('ENTRIES_CRONS', () => {
	// worker.js はこの文字列で Cron を出し分ける。wrangler.toml とずれると、出走馬の取得が頼まれなくなる。
	it('3つとも wrangler.toml の crons に同じ文字列で入っている', () => {
		const toml = readFileSync('wrangler.toml', 'utf8');
		const crons = /^crons\s*=\s*\[(.*)\]$/m.exec(toml)?.[1] ?? '';
		for (const expr of Object.values(ENTRIES_CRONS)) {
			expect(crons).toContain(`"${expr}"`);
		}
		// 結果の Cron も同じ
		expect(crons).toContain(`"${RESULTS_CRON}"`);
	});

	it('結果の Cron はオッズの Cron と同じ分に当たらない（同じ分の2つの式を別々に起こすかに頼らない）', () => {
		const minutes = (expr: string) => expr.split(' ')[0].split(',');
		for (const odds of ODDS_CRONS) {
			for (const m of minutes(RESULTS_CRON)) expect(minutes(odds)).not.toContain(m);
		}
	});

	it('entriesStageOf は式から段を当て、オッズの式・未知の式は null', () => {
		expect(entriesStageOf(ENTRIES_CRONS.candidates)).toBe('candidates');
		expect(entriesStageOf(ENTRIES_CRONS.entries)).toBe('entries');
		expect(entriesStageOf(ENTRIES_CRONS.frames)).toBe('frames');
		for (const expr of ODDS_CRONS) expect(entriesStageOf(expr)).toBeNull();
		expect(entriesStageOf(RESULTS_CRON)).toBeNull();
		expect(entriesStageOf('0 0 * * *')).toBeNull();
	});
});
