import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { INSIGHT_ATTACHED_LIMIT, INSIGHT_WORDS_LIMIT } from '$lib/schemas/insight';
import {
	addInsightWord,
	getInsightTarget,
	listHorseInsights,
	listInsightWords,
	removeInsightWord,
	setInsightMemo,
	setInsightWord,
	type InsightTarget
} from './insights';
import { listRaceMemoContext, mergeHorseTimeline, saveRaceReview } from './notes';
import { listGradedRacesInWeek, listRaces, listRacesBetween } from './races';

let state: ReturnType<typeof createTestDb>;
const target = (entryId: string, raceId = 'r1', horseId = 'h1'): InsightTarget => ({
	entryId,
	raceId,
	horseId,
	date: raceId === 'r1' ? '2026-06-14' : '2026-09-20'
});

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

	it('削除は自分の言葉だけで、付けた記録には触らない', async () => {
		await addInsightWord(state.db, 'a', '前が壁');
		await addInsightWord(state.db, 'b', '前が壁');
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);

		await removeInsightWord(state.db, 'a', '前が壁');

		expect(await listInsightWords(state.db, 'a')).toEqual([]);
		expect(await listInsightWords(state.db, 'b')).toEqual(['前が壁']);
		expect(rows()).toEqual([
			expect.objectContaining({ user_id: 'a', race_entry_id: 'e1', words: '["前が壁"]' })
		]);
	});
});

describe('getInsightTarget', () => {
	it('このレースの出走馬ならレース日と馬を返し、別のレースの出走馬は null', async () => {
		expect(await getInsightTarget(state.db, 'r1', 'e1')).toEqual({
			entryId: 'e1',
			raceId: 'r1',
			horseId: 'h1',
			date: '2026-06-14'
		});
		expect(await getInsightTarget(state.db, 'r1', 'e3')).toBeNull();
		expect(await getInsightTarget(state.db, 'nope', 'e1')).toBeNull();
	});
});

describe('言葉を付ける・外す', () => {
	it('付けた言葉は 2 回押しても重複せず、外すと消える', async () => {
		expect(await setInsightWord(state.db, 'a', target('e1'), '前が壁', true)).toEqual({
			words: ['前が壁'],
			memo: ''
		});
		expect((await setInsightWord(state.db, 'a', target('e1'), '前が壁', true)).words).toEqual([
			'前が壁'
		]);
		expect((await setInsightWord(state.db, 'a', target('e1'), '内詰まり', true)).words).toEqual([
			'前が壁',
			'内詰まり'
		]);
		expect((await setInsightWord(state.db, 'a', target('e1'), '前が壁', false)).words).toEqual([
			'内詰まり'
		]);
	});

	it('言葉もメモも空になった行は消える。メモが残るあいだは消えない', async () => {
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
		expect(await setInsightWord(state.db, 'a', target('e1'), '前が壁', false)).toEqual({
			words: [],
			memo: ''
		});
		expect(rows()).toEqual([]);

		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
		await setInsightMemo(state.db, 'a', target('e1'), '2400 なら。');
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', false);
		expect(rows()).toEqual([expect.objectContaining({ words: '[]', memo: '2400 なら。' })]);
	});

	it('付いていない言葉を外しても、行が無ければ何も作らない', async () => {
		expect(await setInsightWord(state.db, 'a', target('e1'), '前が壁', false)).toEqual({
			words: [],
			memo: ''
		});
		expect(rows()).toEqual([]);
	});

	it('1 頭に付く数には上限があり、41 個目は増えない', async () => {
		for (let i = 0; i < INSIGHT_ATTACHED_LIMIT; i++) {
			await setInsightWord(state.db, 'a', target('e1'), `語${i}`, true);
		}
		const r = await setInsightWord(state.db, 'a', target('e1'), '41個目', true);
		expect(r.words).toHaveLength(INSIGHT_ATTACHED_LIMIT);
		expect(r.words).not.toContain('41個目');
	});

	it('他人の行は読めず、書いても自分の行にしか入らない', async () => {
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
		const mine = await setInsightWord(state.db, 'b', target('e1'), '内詰まり', true);
		expect(mine.words).toEqual(['内詰まり']);
		// b が外しても a の行は変わらない。
		await setInsightWord(state.db, 'b', target('e1'), '前が壁', false);
		expect(rows()).toEqual([
			expect.objectContaining({ user_id: 'a', words: '["前が壁"]' }),
			expect.objectContaining({ user_id: 'b', words: '["内詰まり"]' })
		]);
	});
});

describe('自由入力の気づき', () => {
	it('メモを保存しても言葉は消えず、言葉を付けてもメモは消えない', async () => {
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
		expect(await setInsightMemo(state.db, 'a', target('e1'), '2400 なら。')).toEqual({
			words: ['前が壁'],
			memo: '2400 なら。'
		});
		expect((await setInsightWord(state.db, 'a', target('e1'), '内詰まり', true)).memo).toBe(
			'2400 なら。'
		);
	});

	it('空にすると、言葉が無ければ行ごと消え、言葉があれば残る', async () => {
		await setInsightMemo(state.db, 'a', target('e1'), '前が壁');
		await setInsightMemo(state.db, 'a', target('e1'), '');
		expect(rows()).toEqual([]);

		await setInsightWord(state.db, 'a', target('e2', 'r1', 'h2'), '前残り', true);
		await setInsightMemo(state.db, 'a', target('e2', 'r1', 'h2'), 'x');
		await setInsightMemo(state.db, 'a', target('e2', 'r1', 'h2'), '');
		expect(rows()).toEqual([
			expect.objectContaining({ race_entry_id: 'e2', words: '["前残り"]', memo: '' })
		]);
	});
});

describe('ふりかえりの保存との関係', () => {
	it('ふりかえりを保存しても空にしても、気づきには触らない', async () => {
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
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
		await setInsightWord(state.db, 'a', target('e3', 'r2', 'h1'), '前が壁', true);
		await setInsightMemo(state.db, 'a', target('e1'), 'このレースのメモ');
		await setInsightWord(state.db, 'b', target('e1'), '他人の言葉', true);

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
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
		await setInsightWord(state.db, 'a', target('e3', 'r2', 'h1'), '前残り', true);
		await setInsightWord(state.db, 'b', target('e1'), '他人の言葉', true);
		await setInsightWord(state.db, 'a', target('e2', 'r1', 'h2'), '別の馬', true);

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
		await setInsightWord(state.db, 'a', target('e1'), '前が壁', true);
		await setInsightWord(state.db, 'a', target('e2', 'r1', 'h2'), '前残り', true);
		await setInsightWord(state.db, 'b', target('e3', 'r2', 'h1'), '他人', true);

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
