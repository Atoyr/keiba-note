import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { getRaceOdds } from './odds';

// 書き込み（取得した値の保存）は GitHub Actions 側（scripts/odds/store.spec.ts）で見る。ここは読むだけ。
let db: Db;
let sqlite: DatabaseSync;

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO race (id, date, course, race_number, name, start_time, external_ref) VALUES
		('R1', '2026-09-27', '中山', 11, 'スプリンターズS', '15:40', 'nk-202606040911')`);
});

describe('getRaceOdds', () => {
	it('まだ1度も取れていなければ null', async () => {
		expect(await getRaceOdds(db, 'R1')).toBeNull();
	});

	it('馬番順に、いちばん新しい時点とともに返す', async () => {
		// as_of は unixepoch。2026-09-27T05:00:00Z と 05:30:00Z
		sqlite.exec(`INSERT INTO race_odds (race_id, horse_number, win_odds, place_odds_min, place_odds_max, as_of, fetched_at) VALUES
			('R1', 2, NULL, NULL, NULL, 1790487000, 1790487030),
			('R1', 1, 3.4, 1.4, 1.8, 1790485200, 1790485230)`);
		expect(await getRaceOdds(db, 'R1')).toEqual({
			asOf: '2026-09-27T05:30:00.000Z',
			horses: [
				{ horseNumber: 1, winOdds: 3.4, placeOddsMin: 1.4, placeOddsMax: 1.8 },
				{ horseNumber: 2, winOdds: null, placeOddsMin: null, placeOddsMax: null }
			]
		});
	});
});
