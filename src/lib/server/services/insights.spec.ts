import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { INSIGHT_WORDS_LIMIT } from '$lib/schemas/insight';
import {
	addInsightWord,
	addInsightWords,
	listHorseInsights,
	listInsightWords,
	removeInsightWord
} from './insights';
import { listRaceMemoContext, mergeHorseTimeline, saveRaceReview } from './notes';
import { listGradedRacesInWeek, listRaces, listRacesBetween } from './races';

let state: ReturnType<typeof createTestDb>;
/** 以前に残した気づきの行を直接入れる（新しくは作らないので、書く関数は無い）。 */
function seedInsight(
	userId: string,
	entryId: string,
	raceId: string,
	horseId: string,
	words: string[],
	memo = ''
) {
	state.sqlite
		.prepare(
			'INSERT INTO race_entry_insight (user_id, race_entry_id, race_id, horse_id, words, memo, occurred_at) VALUES (?,?,?,?,?,?,?)'
		)
		.run(
			userId,
			entryId,
			raceId,
			horseId,
			JSON.stringify(words),
			memo,
			raceId === 'r1' ? '2026-06-14' : '2026-09-20'
		);
}

beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','A'), ('b','gb','b@example.invalid','B');
		INSERT INTO horse (id,name) VALUES ('h1','イチバンボシ'), ('h2','ニバンテ');
		INSERT INTO race (id,date,course,race_number,name,grade,surface) VALUES
			('r1','2026-06-14','中山',11,'初夏賞','G3','芝'),
			('r2','2026-09-20','中山',11,'秋分賞','G2','芝');
		INSERT INTO race_entry (id,race_id,horse_id,horse_number,finish_position) VALUES
			('e1','r1','h1',3,1),
			('e2','r1','h2',4,2),
			('e3','r2','h1',5,2);
	`);
});
afterEach(() => state.sqlite.close());

const rows = () =>
	state.sqlite
		.prepare(
			'SELECT user_id, race_entry_id, words, memo FROM race_entry_insight ORDER BY user_id, race_entry_id'
		)
		.all();

describe('言葉の登録', () => {
	it('登録順に返り、他人の言葉は読めない', async () => {
		await addInsightWord(state.db, 'a', '前が壁');
		await addInsightWord(state.db, 'b', '他人の言葉');
		await addInsightWord(state.db, 'a', '内詰まり');
		expect(await listInsightWords(state.db, 'a')).toEqual(['前が壁', '内詰まり']);
		expect(await listInsightWords(state.db, 'b')).toEqual(['他人の言葉']);
	});

	it('同じ言葉は重複として断り、上限を超える登録も断る', async () => {
		expect(await addInsightWord(state.db, 'a', '前が壁')).toEqual({ ok: true });
		expect(await addInsightWord(state.db, 'a', '前が壁')).toEqual({
			ok: false,
			reason: 'duplicate'
		});
		for (let i = 1; i < INSIGHT_WORDS_LIMIT; i++) await addInsightWord(state.db, 'a', `語${i}`);
		expect(await addInsightWord(state.db, 'a', '31個目')).toEqual({ ok: false, reason: 'limit' });
		// 別の人の上限には影響しない。
		expect(await addInsightWord(state.db, 'b', '前が壁')).toEqual({ ok: true });
	});

	it('まとめて登録は、渡した順に、未登録のものだけ足す（全部足せる・一部登録済み）', async () => {
		expect(await addInsightWords(state.db, 'a', ['前が壁', '内詰まり'])).toEqual({
			added: ['前が壁', '内詰まり'],
			limited: false
		});
		await addInsightWord(state.db, 'b', '他人の言葉');
		expect(
			await addInsightWords(state.db, 'a', ['内詰まり', '出遅れ', '前が壁', '前残り'])
		).toEqual({
			added: ['出遅れ', '前残り'],
			limited: false
		});
		expect(await listInsightWords(state.db, 'a')).toEqual([
			'前が壁',
			'内詰まり',
			'出遅れ',
			'前残り'
		]);
		expect(await listInsightWords(state.db, 'b')).toEqual(['他人の言葉']);
	});

	it('まとめて登録の added は、登録済みの言葉を含めない', async () => {
		// 読んだあとに別の操作が同じ言葉を足す競合（returning で除く分）は、ここでは再現できない。
		await addInsightWord(state.db, 'a', '前が壁');
		const r = await addInsightWords(state.db, 'a', ['前が壁', '出遅れ']);
		expect(r).toEqual({ added: ['出遅れ'], limited: false });
		expect(await listInsightWords(state.db, 'a')).toEqual(['前が壁', '出遅れ']);
	});

	it('まとめて登録は、上限までの残りだけ足し、入りきらなければ limited。上限ちょうどなら何も足さない', async () => {
		for (let i = 1; i <= INSIGHT_WORDS_LIMIT - 2; i++)
			await addInsightWord(state.db, 'a', `語${i}`);
		expect(await addInsightWords(state.db, 'a', ['A', 'B', 'C'])).toEqual({
			added: ['A', 'B'],
			limited: true
		});
		expect((await listInsightWords(state.db, 'a')).length).toBe(INSIGHT_WORDS_LIMIT);
		expect(await addInsightWords(state.db, 'a', ['C', 'D'])).toEqual({ added: [], limited: true });
		expect((await listInsightWords(state.db, 'a')).length).toBe(INSIGHT_WORDS_LIMIT);
	});

	it('削除は自分の言葉だけで、付けた記録には触らない', async () => {
		await addInsightWord(state.db, 'a', '前が壁');
		await addInsightWord(state.db, 'b', '前が壁');
		seedInsight('a', 'e1', 'r1', 'h1', ['前が壁']);

		await removeInsightWord(state.db, 'a', '前が壁');

		expect(await listInsightWords(state.db, 'a')).toEqual([]);
		expect(await listInsightWords(state.db, 'b')).toEqual(['前が壁']);
		expect(rows()).toEqual([
			expect.objectContaining({ user_id: 'a', race_entry_id: 'e1', words: '["前が壁"]' })
		]);
	});
});

describe('ふりかえりの保存との関係', () => {
	it('ふりかえりを保存しても空にしても、気づきには触らない', async () => {
		seedInsight('a', 'e1', 'r1', 'h1', ['前が壁']);
		await saveRaceReview(
			state.db,
			{
				raceId: 'r1',
				raceNote: { body: '本文' },
				entries: [{ entryId: 'e1', horseId: 'h1', body: '馬のメモ', tags: [] }]
			},
			'a',
			'2026-06-14'
		);
		await saveRaceReview(
			state.db,
			{
				raceId: 'r1',
				raceNote: { body: '' },
				entries: [{ entryId: 'e1', horseId: 'h1', body: '', tags: [] }]
			},
			'a',
			'2026-06-14'
		);
		expect(rows()).toEqual([expect.objectContaining({ race_entry_id: 'e1', words: '["前が壁"]' })]);
	});
});

describe('画面で読む', () => {
	it('listRaceMemoContext は言葉・このレースの気づき・ほかのレースの気づきを分け、他人のものを除く', async () => {
		await addInsightWord(state.db, 'a', '前が壁');
		await addInsightWord(state.db, 'b', '他人の言葉');
		seedInsight('a', 'e3', 'r2', 'h1', ['前が壁']);
		seedInsight('a', 'e1', 'r1', 'h1', [], 'このレースのメモ');
		seedInsight('b', 'e1', 'r1', 'h1', ['他人の言葉']);

		// ふりかえり画面（r1）から見る: e1 はこのレース、e3 は h1 のほかのレース。
		const ctx = await listRaceMemoContext(state.db, 'r1', ['h1', 'h2'], 'a');
		expect(ctx.insightWords).toEqual(['前が壁']);
		expect([...ctx.raceInsights]).toEqual([['e1', { words: [], memo: 'このレースのメモ' }]]);
		expect([...ctx.pastRunInsights]).toEqual([['e3', { words: ['前が壁'], memo: '' }]]);

		// 出走馬が 0 頭のレースでも読める。
		const empty = await listRaceMemoContext(state.db, 'r1', [], 'a');
		expect(empty.pastRunInsights.size).toBe(0);
		expect(empty.insightWords).toEqual(['前が壁']);
	});

	it('listHorseInsights はその馬の自分の気づきだけを新しい順に返す', async () => {
		seedInsight('a', 'e1', 'r1', 'h1', ['前が壁']);
		seedInsight('a', 'e3', 'r2', 'h1', ['前残り']);
		seedInsight('b', 'e1', 'r1', 'h1', ['他人の言葉']);
		seedInsight('a', 'e2', 'r1', 'h2', ['別の馬']);

		const list = await listHorseInsights(state.db, 'h1', 'a');
		expect(
			list.map((i) => [i.raceEntryId, i.occurredAt, i.words, i.raceName, i.resultCount])
		).toEqual([
			['e3', '2026-09-20', ['前残り'], '秋分賞', 1],
			['e1', '2026-06-14', ['前が壁'], '初夏賞', 2]
		]);
	});
});

describe('一覧の insightCount', () => {
	it('自分が気づきを残した馬の数だけを数え、他人の分は数えない', async () => {
		seedInsight('a', 'e1', 'r1', 'h1', ['前が壁']);
		seedInsight('a', 'e2', 'r1', 'h2', ['前残り']);
		seedInsight('b', 'e3', 'r2', 'h1', ['他人']);

		const byId = (items: { id: string; insightCount: number }[]) =>
			Object.fromEntries(items.map((r) => [r.id, r.insightCount]));
		const page = await listRaces(state.db, 'a');
		expect(byId(page.items)).toEqual({ r1: 2, r2: 0 });
		expect(
			byId(await listRacesBetween(state.db, 'a', { from: '2026-06-01', to: '2026-09-30' }))
		).toEqual({
			r1: 2,
			r2: 0
		});
		const graded = await listGradedRacesInWeek(
			state.db,
			{ start: '2026-06-08', end: '2026-06-14' },
			'a'
		);
		expect(byId(graded)).toEqual({ r1: 2 });
	});
});

describe('mergeHorseTimeline', () => {
	const run = (entryId: string, date: string) =>
		({ entryId, date, raceId: `r-${entryId}` }) as unknown as Parameters<
			typeof mergeHorseTimeline
		>[1][number];
	const insight = (entryId: string, occurredAt: string) =>
		({
			raceEntryId: entryId,
			raceId: 'r1',
			occurredAt,
			words: ['前が壁'],
			memo: ''
		}) as unknown as NonNullable<Parameters<typeof mergeHorseTimeline>[3]>[number];

	it('同じ日付ではメモ → 気づき → 出走の順で、気づきのある出走は出走行を出さない', () => {
		const note = {
			id: 'n1',
			occurredAt: '2026-06-14',
			raceEntryId: 'eX'
		} as unknown as Parameters<typeof mergeHorseTimeline>[0][number];
		const rows = mergeHorseTimeline(
			[note],
			[run('e1', '2026-06-14'), run('e2', '2026-06-14'), run('e9', '2026-07-01')],
			'2026-08-01',
			[insight('e1', '2026-06-14')]
		);
		expect(rows.map((r) => r.key)).toEqual(['run:e9', 'note:n1', 'insight:e1', 'run:e2']);
	});
});
