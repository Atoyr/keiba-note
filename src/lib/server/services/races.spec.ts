import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { getRaceForPreview, getRaceForReview, listRacesBetween, resolveWeek } from './races';

/** JST は UTC+9。UTC の 15:00 が JST の翌日 0:00。 */
const utc = (iso: string) => new Date(iso);

/**
 * 開催日を返すだけの db。日付の絞り込みは効かせない。
 *
 * どこまで読むかは `weekLookupRange`、連休の扱いは `currentWeek` / `shiftWeek` の
 * 単体テスト（date.spec.ts）で見ている。ここで確かめたいのは、
 * **読んだ開催日と週送りが週の解決に渡っているか**だけ。
 */
function fakeDb(dates: string[]): Db {
	return {
		selectDistinct: () => ({
			from: () => ({
				where: () => Promise.resolve(dates.map((date) => ({ date })))
			})
		})
	} as unknown as Db;
}

// 9/26(土) 9/27(日) に加えて、連休で 9/28(月) にも開催がある週
const holiday = ['2026-09-26', '2026-09-27', '2026-09-28'];

describe('resolveWeek', () => {
	it('次の週は、連休に譲ったぶんの翌日から始まる', async () => {
		expect(await resolveWeek(fakeDb(holiday), 1, utc('2026-09-28T03:00:00Z'))).toEqual({
			start: '2026-09-29',
			end: '2026-10-04'
		});
	});
});

describe('listRacesBetween の印の数', () => {
	let state: ReturnType<typeof createTestDb>;
	beforeEach(() => {
		state = createTestDb();
		state.sqlite.exec(`
			INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A');
			INSERT INTO race (id,date,course,name) VALUES ('r','2099-01-01','東京','テスト賞');
			INSERT INTO horse (id,name) VALUES ('h1','ホース1'), ('h2','ホース2'), ('h3','ホース3');
			INSERT INTO race_entry (id,race_id,horse_id,horse_number) VALUES ('e1','r','h1',1), ('e2','r','h2',2), ('e3','r','h3',3);
			INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,mark,occurred_at) VALUES
				('n1','a','preview','r','h1','e1','','◎','2099-01-01'),
				('n2','a','preview','r','h2','e2','','✓','2099-01-01'),
				('n3','a','preview','r','h3','e3','','×','2099-01-01');
		`);
	});
	afterEach(() => state.sqlite.close());

	// ✓ は候補のチェックで予想の印ではない。✓ だけ付けた段階を「印 済み」に見せない。
	it('候補のチェック（✓）は印の数に入れない', async () => {
		const [item] = await listRacesBetween(state.db, 'a', { from: '2099-01-01', to: '2099-01-01' });
		expect(item.markCount).toBe(2);
	});
});

describe('出走馬の基本情報（馬名を押して開く枠の材料）', () => {
	let state: ReturnType<typeof createTestDb>;
	beforeEach(() => {
		state = createTestDb();
		state.sqlite.exec(`
			INSERT INTO race (id,date,course,name) VALUES ('r','2099-01-01','東京','テスト賞');
			INSERT INTO horse (id,name,sire,dam,dam_sire,trainer,training_center) VALUES
				('h1','ホース1','チチ','ハハ','ハハチチ','調教師A','栗東');
			INSERT INTO horse (id,name) VALUES ('h2','ホース2');
			INSERT INTO race_entry (id,race_id,horse_id,horse_number) VALUES ('e1','r','h1',1), ('e2','r','h2',2);
		`);
	});
	afterEach(() => state.sqlite.close());

	const profile = {
		sire: 'チチ',
		dam: 'ハハ',
		damSire: 'ハハチチ',
		trainer: '調教師A',
		trainingCenter: '栗東'
	};
	const none = { sire: null, dam: null, damSire: null, trainer: null, trainingCenter: null };

	it('予想の出走馬に父・母・母父・調教師・所属が入り、無い馬は null', async () => {
		const { entries } = await getRaceForPreview(state.db, 'r');
		expect(entries).toMatchObject([profile, none]);
	});

	it('ふりかえりの出走馬にも入る', async () => {
		const { entries } = await getRaceForReview(state.db, 'r');
		expect(entries).toMatchObject([profile, none]);
	});
});
