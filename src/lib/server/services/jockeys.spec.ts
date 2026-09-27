import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import {
	countJockeyRides,
	getJockeySummary,
	jockeyExists,
	listJockeyRideNotes,
	listJockeyRides,
	listJockeys,
	listJockeyTagsInUse,
	mergeJockeyTimeline,
	saveJockeySummary
} from './jockeys';

let state: ReturnType<typeof createTestDb>;
beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO horse (id,name) VALUES ('h1','イチバンボシ'), ('h2','ニバンテ');
		INSERT INTO race (id,date,course,race_number,name,grade) VALUES
			('r1','2026-06-14','中山',11,'初夏賞','G3'),
			('r2','2026-09-20','中山',11,'秋分賞','G2'),
			('r3','2099-04-04','東京',11,'未来賞','G1');
		INSERT INTO race_entry (id,race_id,horse_id,horse_number,jockey,finish_position) VALUES
			('e1','r1','h1',3,'ヤマダ',1),
			('e2','r2','h1',5,'スズキ',2),
			('e3','r2','h2',7,'ヤマダ',6),
			('e4','r3','h2',NULL,'ヤマダ',NULL),
			('e5','r3','h1',NULL,'',NULL),
			('e6','r1','h2',4,NULL,3);
		INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,tags,mark,occurred_at) VALUES
			('n1','a','entry','r1','h1','e1','直線で抜け出した。','["好上がり"]',NULL,'2026-06-14'),
			('n2','a','preview','r1','h1','e1','内枠を活かしたい。','[]','◎','2026-06-14'),
			('n3','a','entry','r2','h1','e2','スズキ騎乗の走り。','[]',NULL,'2026-09-20'),
			('n4','b','entry','r2','h2','e3','他人のメモ。','[]',NULL,'2026-09-20');
		INSERT INTO note (id,author_id,kind,horse_id,body,tags,occurred_at) VALUES
			('n5','a','horse','h1','近況メモ。','[]','2026-07-01');
	`);
});
afterEach(() => state.sqlite.close());

describe('騎手の一覧', () => {
	it('騎乗の多い順に、名前の無い騎乗を除いて並ぶ', async () => {
		const list = await listJockeys(state.db, 'a', { q: '', tag: null });
		expect(list.map((j) => [j.name, j.rideCount, j.lastRideDate])).toEqual([
			['ヤマダ', 3, '2099-04-04'],
			['スズキ', 1, '2026-09-20']
		]);
	});

	it('メモの件数とまとめの札は自分のものだけ', async () => {
		await saveJockeySummary(state.db, 'ヤマダ', { body: '', tags: ['中山巧者'] }, 'b');
		const list = await listJockeys(state.db, 'a', { q: '', tag: null });
		// a が書いたのは e1 の2件（n1・n2）。b の n4（e3）は数えない。
		expect(list.find((j) => j.name === 'ヤマダ')).toMatchObject({ noteCount: 2, tags: [] });
	});

	it('名前の部分一致と、自分が付けた札で絞る', async () => {
		await saveJockeySummary(state.db, 'スズキ', { body: '', tags: ['中山巧者', '穴で怖い'] }, 'a');
		// 他人が付けた札では絞られない。
		await saveJockeySummary(state.db, 'ヤマダ', { body: '', tags: ['中山巧者'] }, 'b');

		expect((await listJockeys(state.db, 'a', { q: 'マダ', tag: null })).map((j) => j.name)).toEqual(
			['ヤマダ']
		);
		const tagged = await listJockeys(state.db, 'a', { q: '', tag: '中山巧者' });
		expect(tagged.map((j) => [j.name, j.tags])).toEqual([['スズキ', ['中山巧者', '穴で怖い']]]);
		expect(await listJockeys(state.db, 'a', { q: '', tag: '東京巧者' })).toEqual([]);

		// 札で絞る選択肢は、自分が付けている札だけ（選択肢の順）。
		expect(await listJockeyTagsInUse(state.db, 'a')).toEqual(['中山巧者', '穴で怖い']);
		expect(await listJockeyTagsInUse(state.db, 'b')).toEqual(['中山巧者']);
	});
});

describe('騎手のタイムライン', () => {
	it('騎乗は新しい順で、ほかの騎手の騎乗は混ざらない', async () => {
		const rides = await listJockeyRides(state.db, 'ヤマダ');
		expect(rides.map((r) => r.entryId)).toEqual(['e4', 'e3', 'e1']);
		expect(rides[2]).toMatchObject({
			horseName: 'イチバンボシ',
			raceName: '初夏賞',
			resultCount: 2
		});
	});

	it('メモはその騎乗に付いた自分のものだけ（近況メモ・別の騎手の走り・他人のメモは出ない）', async () => {
		const notes = await listJockeyRideNotes(state.db, 'ヤマダ', 'a');
		expect(notes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
		expect(await listJockeyRideNotes(state.db, 'ヤマダ', 'b')).toMatchObject([{ id: 'n4' }]);
	});

	it('メモは騎乗の下に、出走前 → ふりかえりの順で重なる', async () => {
		const rows = mergeJockeyTimeline(
			await listJockeyRides(state.db, 'ヤマダ'),
			await listJockeyRideNotes(state.db, 'ヤマダ', 'a'),
			'2026-09-27'
		);
		expect(rows.map((r) => [r.ride.entryId, r.upcoming, r.notes.map((n) => n.id)])).toEqual([
			['e4', true, []],
			['e3', false, []],
			['e1', false, ['n2', 'n1']]
		]);
	});

	it('当日の騎乗は予定にしない', () => {
		const ride = { entryId: 'x', date: '2026-09-27' } as Parameters<
			typeof mergeJockeyTimeline
		>[0][number];
		expect(mergeJockeyTimeline([ride], [], '2026-09-27')[0].upcoming).toBe(false);
	});

	it('騎乗の数は上限で切る前の数', async () => {
		expect(await listJockeyRides(state.db, 'ヤマダ', 2)).toHaveLength(2);
		expect(await countJockeyRides(state.db, 'ヤマダ')).toBe(3);
		expect(await countJockeyRides(state.db, 'タナカ')).toBe(0);
	});

	it('騎乗の無い名前は無い騎手', async () => {
		expect(await jockeyExists(state.db, 'ヤマダ')).toBe(true);
		expect(await jockeyExists(state.db, 'タナカ')).toBe(false);
	});
});

describe('騎手のまとめ', () => {
	it('1人・1騎手につき1本で、書き直すと上書きになる', async () => {
		await saveJockeySummary(state.db, 'ヤマダ', { body: ' 中山の内が上手い ', tags: [] }, 'a');
		await saveJockeySummary(
			state.db,
			'ヤマダ',
			{ body: '外差しも決める', tags: ['中山巧者'] },
			'a'
		);

		expect(await getJockeySummary(state.db, 'ヤマダ', 'a')).toEqual({
			body: '外差しも決める',
			tags: ['中山巧者']
		});
		expect(state.sqlite.prepare('SELECT count(*) AS n FROM jockey_note').get()).toEqual({ n: 1 });
	});

	it('札だけでも残り、本文も札も空なら消える', async () => {
		expect(await saveJockeySummary(state.db, 'ヤマダ', { body: '', tags: ['穴で怖い'] }, 'a')).toBe(
			'saved'
		);
		expect(await getJockeySummary(state.db, 'ヤマダ', 'a')).toEqual({
			body: '',
			tags: ['穴で怖い']
		});

		expect(await saveJockeySummary(state.db, 'ヤマダ', { body: '  ', tags: [] }, 'a')).toBe(
			'cleared'
		);
		expect(await getJockeySummary(state.db, 'ヤマダ', 'a')).toBeNull();
	});

	it('他人のまとめは読めず、消すこともできない', async () => {
		await saveJockeySummary(state.db, 'ヤマダ', { body: 'b のまとめ', tags: [] }, 'b');

		expect(await getJockeySummary(state.db, 'ヤマダ', 'a')).toBeNull();
		await saveJockeySummary(state.db, 'ヤマダ', { body: '', tags: [] }, 'a');
		expect(await getJockeySummary(state.db, 'ヤマダ', 'b')).toEqual({
			body: 'b のまとめ',
			tags: []
		});
	});
});
