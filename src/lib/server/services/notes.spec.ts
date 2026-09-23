import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import type { NoteTag } from '$lib/schemas/note';
import type { HorseRun } from './races';
import { mergeHorseTimeline, saveRaceReview, savePreviewNotes, type TimelineNote } from './notes';

type Op = { kind: 'insert'; values: Record<string, unknown> } | { kind: 'delete' };

/**
 * `batch()` に積まれた文を記録するだけの db。
 *
 * 確かめたいのは SQL の形ではなく、**どの入力が「残す」でどの入力が「消す」に
 * 振り分けられるか**。札だけ付けたメモが消えると、書いた札が黙って失われる。
 */
function fakeDb() {
	const ops: Op[] = [];

	const db = {
		insert: () => ({
			values: (values: Record<string, unknown>) => {
				const stmt = { op: { kind: 'insert', values } as Op };
				// upsert の形なので onConflictDoUpdate まで繋がって初めて文になる。
				return { onConflictDoUpdate: () => stmt };
			}
		}),
		delete: () => ({ where: () => ({ op: { kind: 'delete' } as Op }) }),
		batch: (statements: { op: Op }[]) => {
			ops.push(...statements.map((s) => s.op));
			return Promise.resolve([]);
		}
	};

	return { db: db as unknown as Db, ops };
}

const entry = (over: Partial<{ body: string; tags: NoteTag[] }> = {}) => ({
	entryId: 'e1',
	horseId: 'h1',
	body: '',
	tags: [] as NoteTag[],
	...over
});

describe('saveRaceReview', () => {
	it('本文が空でも札があればメモを残す', async () => {
		const { db, ops } = fakeDb();

		const result = await saveRaceReview(
			db,
			{ raceId: 'r1', raceNote: { body: '' }, entries: [entry({ tags: ['不利'] })] },
			'u1',
			'2026-09-27'
		);

		// レースのメモは空なので消える。出走馬のメモは札だけで残る。
		expect(ops).toEqual([
			{ kind: 'delete' },
			{
				kind: 'insert',
				values: expect.objectContaining({ kind: 'entry', body: '', tags: ['不利'] })
			}
		]);
		expect(result).toEqual({ saved: 1, cleared: 1 });
	});

	it('本文も札も空なら既存メモを消す', async () => {
		const { db, ops } = fakeDb();

		const result = await saveRaceReview(
			db,
			{ raceId: 'r1', raceNote: { body: '' }, entries: [entry()] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([{ kind: 'delete' }, { kind: 'delete' }]);
		expect(result).toEqual({ saved: 0, cleared: 2 });
	});

	it('空白だけの本文は「空」として扱い、札の有無で残すか決める', async () => {
		const { db, ops } = fakeDb();

		await saveRaceReview(
			db,
			{ raceId: 'r1', raceNote: { body: '  ' }, entries: [entry({ body: ' \n ' })] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([{ kind: 'delete' }, { kind: 'delete' }]);
	});
});

describe('savePreviewNotes', () => {
	it('印が無くても札だけで出走前メモを残す', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{
				raceId: 'r1',
				raceNote: { body: '' },
				entries: [{ ...entry({ tags: ['馬場一致'] }), mark: null }]
			},
			'u1',
			'2026-09-27'
		);

		// 見立ては空なので消える。出走馬のメモは札だけで残る。
		expect(ops).toEqual([
			{ kind: 'delete' },
			{
				kind: 'insert',
				values: expect.objectContaining({ kind: 'preview', mark: null, tags: ['馬場一致'] })
			}
		]);
		expect(result).toEqual({ saved: 1, cleared: 1 });
	});

	it('本文も印も札も無ければ消す', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: '' }, entries: [{ ...entry(), mark: null }] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([{ kind: 'delete' }, { kind: 'delete' }]);
		expect(result).toEqual({ saved: 0, cleared: 2 });
	});

	/**
	 * 出馬表が出る前の重賞。**出走馬が1頭もいなくても見立てだけは保存される。**
	 * ここが落ちると「未来のレースにメモを書けない」に戻る。
	 */
	it('出走馬が1頭もいなくても見立ては保存される', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: '開幕週で内有利になりそう。' }, entries: [] },
			'u1',
			'2099-06-06'
		);

		expect(ops).toEqual([
			{
				kind: 'insert',
				values: expect.objectContaining({
					kind: 'race_preview',
					raceId: 'r1',
					body: '開幕週で内有利になりそう。',
					// occurred_at はレース日。タイムラインでそのレースの位置に並ぶ。
					occurredAt: '2099-06-06'
				})
			}
		]);
		expect(result).toEqual({ saved: 1, cleared: 0 });
	});

	/**
	 * 見立て（`race_preview`）とふりかえりのレースのメモ（`race`）は**別の行**。
	 * kind が同じだと、開催後の保存で開催前に書いたものが黙って消える。
	 */
	it('見立てはふりかえりのレースのメモとは別の kind で入る', async () => {
		const preview = fakeDb();
		await savePreviewNotes(
			preview.db,
			{ raceId: 'r1', raceNote: { body: '内有利' }, entries: [] },
			'u1',
			'2026-09-27'
		);

		const review = fakeDb();
		await saveRaceReview(
			review.db,
			{ raceId: 'r1', raceNote: { body: '実際に内有利' }, entries: [] },
			'u1',
			'2026-09-27'
		);

		expect(preview.ops[0]).toMatchObject({ values: { kind: 'race_preview' } });
		expect(review.ops[0]).toMatchObject({ values: { kind: 'race' } });
	});

	it('空白だけの見立ては「空」として扱い、既存の見立てを消す', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: ' \n ' }, entries: [] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([{ kind: 'delete' }]);
		expect(result).toEqual({ saved: 0, cleared: 1 });
	});
});

describe('mergeHorseTimeline', () => {
	const run = (over: Partial<HorseRun> = {}): HorseRun => ({
		entryId: 'e1',
		raceId: 'r1',
		date: '2026-09-20',
		course: '中山',
		raceNumber: 11,
		raceName: 'オールカマー',
		grade: 'G2',
		className: null,
		finishPosition: 1,
		...over
	});

	const memo = (over: Partial<TimelineNote> = {}): TimelineNote => ({
		id: 'n1',
		kind: 'entry',
		body: '直線で外に出してから一完歩が速い。',
		tags: [],
		mark: null,
		visibility: 'private',
		occurredAt: '2026-09-20',
		authorId: 'u1',
		authorName: 'わたし',
		raceId: 'r1',
		raceName: 'オールカマー',
		course: '中山',
		raceNumber: 11,
		grade: 'G2',
		finishPosition: 1,
		raceEntryId: 'e1',
		...over
	});

	it('メモを書かなかった出走もタイムラインに出る', () => {
		const rows = mergeHorseTimeline([], [run()], '2026-09-27');

		expect(rows).toEqual([
			expect.objectContaining({ type: 'run', occurredAt: '2026-09-20', upcoming: false })
		]);
	});

	it('メモのある出走は出走行を出さない（同じレースが2行にならない）', () => {
		const rows = mergeHorseTimeline([memo()], [run()], '2026-09-27');

		expect(rows).toEqual([expect.objectContaining({ type: 'note', key: 'note:n1' })]);
	});

	// 1つの出走に「出走前」と「ふりかえり」の2件が付く。片方でもあれば骨は要らない。
	it('出走前メモだけでも出走行は出さない', () => {
		const rows = mergeHorseTimeline(
			[memo({ id: 'n2', kind: 'preview', mark: '◎' })],
			[run()],
			'2026-09-27'
		);

		expect(rows.map((r) => r.type)).toEqual(['note']);
	});

	it('未来が上、過去が下。近況メモも同じ流れに混ざる', () => {
		const rows = mergeHorseTimeline(
			[
				memo({ id: 'n1', occurredAt: '2026-09-20', raceEntryId: 'e1' }),
				memo({ id: 'n2', kind: 'horse', occurredAt: '2026-08-02', raceEntryId: null })
			],
			[
				run({ entryId: 'e1', date: '2026-09-20' }),
				run({ entryId: 'e2', date: '2026-10-25', raceName: '天皇賞(秋)', finishPosition: null }),
				run({ entryId: 'e0', date: '2026-06-15' })
			],
			'2026-09-27'
		);

		expect(rows.map((r) => [r.occurredAt, r.key])).toEqual([
			['2026-10-25', 'run:e2'],
			['2026-09-20', 'note:n1'],
			['2026-08-02', 'note:n2'],
			['2026-06-15', 'run:e0']
		]);
	});

	// 「当日は予定にしない」— 朝は予定でも、走り終えた夕方には予定ではない。
	it.each([
		['2026-10-24', true],
		['2026-10-25', false],
		['2026-10-26', false]
	])('today=%s のとき 2026-10-25 の出走予定は %s', (today, upcoming) => {
		const rows = mergeHorseTimeline([], [run({ date: '2026-10-25' })], today);

		expect(rows[0]).toMatchObject({ type: 'run', upcoming });
	});

	it('同じ日付ならメモを先に、メモの無い出走を後に出す', () => {
		const rows = mergeHorseTimeline(
			[memo({ id: 'n3', kind: 'horse', occurredAt: '2026-09-20', raceEntryId: null })],
			[run({ entryId: 'e9', date: '2026-09-20' })],
			'2026-09-27'
		);

		expect(rows.map((r) => r.key)).toEqual(['note:n3', 'run:e9']);
	});
});
