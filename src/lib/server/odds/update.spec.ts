import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { getRaceOdds, saveRaceOdds } from '$lib/server/services/odds';
import { OddsError, type OddsProvider, type RaceOdds } from './odds';
import { updateOdds, type OddsLogEntry } from './update';

let db: Db;
let sqlite: DatabaseSync;

// JST 14:00。R1（15:40）と R2（15:30）が取りに行く時間帯に入っている。
const NOW = new Date('2026-09-27T05:00:00Z');

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	// オッズを取りに行くのは重賞だけ
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, grade, start_time, external_ref) VALUES
		('R1', '2026-09-27', '中山', 11, 'スプリンターズS', 'G1', '15:40', 'nk-202606040911'),
		('R2', '2026-09-27', '阪神', 11, '別のレース', 'G2', '15:30', 'nk-202609040911'),
		('R9', '2026-09-27', '阪神', 12, '対象外（発走後）', 'G3', '10:00', 'nk-202609040912')`);
});

const odds = (raceId: string, win = 3.4): RaceOdds => ({
	raceId,
	asOf: '2026-09-27T04:58:00.000Z',
	fetchedAt: NOW.toISOString(),
	horses: [{ horseNumber: 1, winOdds: win, placeOddsMin: 1.4, placeOddsMax: 1.8 }]
});

/** 呼ばれた順に、渡した結果を返す provider。関数なら呼んで、その結果（か投げたもの）を返す。 */
function provider(...results: Array<RaceOdds | OddsError | ((raceId: string) => RaceOdds)>) {
	const getRaceOdds = vi.fn(async ({ raceId }: { raceId: string }) => {
		const r = results.shift();
		if (!r) throw new Error('呼ばれすぎ');
		if (r instanceof OddsError) throw r;
		return typeof r === 'function' ? r(raceId) : r;
	});
	return { name: 'fake', getRaceOdds } satisfies OddsProvider;
}

function run(p: OddsProvider) {
	const logs: OddsLogEntry[] = [];
	const sleep = vi.fn(async () => {});
	const summary = updateOdds({ db, provider: p, log: (e) => logs.push(e), now: () => NOW, sleep });
	return { summary, logs, sleep };
}

describe('updateOdds', () => {
	it('対象のレースだけを、発走の早い順に1つずつ取りに行って保存する', async () => {
		const p = provider(
			(id) => odds(id),
			(id) => odds(id)
		);
		const { summary, logs, sleep } = run(p);

		expect(await summary).toEqual({
			targets: 2,
			saved: 2,
			notAvailable: 0,
			failed: 0,
			stopped: false
		});
		expect(p.getRaceOdds.mock.calls.map((c) => c[0])).toEqual([
			{ raceId: 'R2', externalRaceId: 'nk-202609040911' },
			{ raceId: 'R1', externalRaceId: 'nk-202606040911' }
		]);
		// レースの間に1回だけ間を空ける
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(await getRaceOdds(db, 'R1')).not.toBeNull();
		expect(logs[0]).toMatchObject({
			level: 'info',
			event: 'odds.fetch',
			provider: 'fake',
			raceId: 'R2',
			externalRaceId: 'nk-202609040911',
			success: true,
			horseCount: 1
		});
	});

	it('届かなかったときは1回だけ再試行する', async () => {
		const p = provider(
			new OddsError('network', 'x'),
			(id) => odds(id),
			(id) => odds(id)
		);
		const { summary } = run(p);
		expect((await summary).saved).toBe(2);
		expect(p.getRaceOdds).toHaveBeenCalledTimes(3);
	});

	it('再試行も失敗したら、前回の値を消さずに次のレースへ進む', async () => {
		await saveRaceOdds(db, odds('R2', 9.9));
		const p = provider(new OddsError('network', 'x'), new OddsError('network', 'x'), (id) =>
			odds(id)
		);
		const { summary, logs } = run(p);

		expect(await summary).toMatchObject({ saved: 1, failed: 1, stopped: false });
		expect((await getRaceOdds(db, 'R2'))?.horses[0].winOdds).toBe(9.9);
		// 一時的な失敗は通知しない
		expect(logs[0]).toMatchObject({ level: 'warn', success: false, errorType: 'network' });
		expect(logs[0].notify).toBe(false);
	});

	it('parse の失敗は再試行せず、通知の対象（error）にする', async () => {
		const p = provider(new OddsError('parse', '形が違う'), (id) => odds(id));
		const { summary, logs } = run(p);

		expect(await summary).toMatchObject({ saved: 1, failed: 1 });
		expect(p.getRaceOdds).toHaveBeenCalledTimes(2);
		expect(logs[0]).toMatchObject({ level: 'error', errorType: 'parse' });
	});

	it('検査に通らない値は保存せず、前回の値を残す', async () => {
		await saveRaceOdds(db, odds('R2', 9.9));
		const p = provider(
			(id) => ({ ...odds(id), horses: [] }),
			(id) => odds(id)
		);
		const { summary, logs } = run(p);

		expect(await summary).toMatchObject({ saved: 1, failed: 1 });
		expect((await getRaceOdds(db, 'R2'))?.horses[0].winOdds).toBe(9.9);
		expect(logs[0]).toMatchObject({ level: 'error', errorType: 'invalid' });
	});

	it('取得元に制限されたら、残りのレースは取りに行かない', async () => {
		const p = provider(new OddsError('rate-limited', '429'), (id) => odds(id));
		const { summary, logs } = run(p);

		expect(await summary).toMatchObject({ targets: 2, saved: 0, failed: 1, stopped: true });
		expect(p.getRaceOdds).toHaveBeenCalledTimes(1);
		expect(logs[0]).toMatchObject({ level: 'warn', notify: true, errorType: 'rate-limited' });
	});

	it('発売前は失敗に数えない', async () => {
		const p = provider(new OddsError('not-available', 'x'), new OddsError('not-available', 'x'));
		const { summary, logs } = run(p);

		expect(await summary).toMatchObject({ notAvailable: 2, failed: 0 });
		expect(logs.every((l) => l.level === 'info')).toBe(true);
	});

	it('対象が無ければ取得元には行かない', async () => {
		sqlite.exec(`UPDATE race SET start_time = '10:00'`);
		const p = provider();
		const { summary } = run(p);

		expect((await summary).targets).toBe(0);
		expect(p.getRaceOdds).not.toHaveBeenCalled();
	});
});
