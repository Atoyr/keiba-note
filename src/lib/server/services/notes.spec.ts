import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import type { NoteTag } from '$lib/schemas/note';
import { emptyFlow, type RaceFlow } from '$lib/schemas/race-flow';
import type { HorseRun } from './races';
import { mergeHorseTimeline, saveRaceReview, savePreviewNotes, type TimelineNote } from './notes';

type Op =
	| { kind: 'insert'; values: Record<string, unknown> }
	| { kind: 'delete' }
	| { kind: 'update'; set: Record<string, unknown> };

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
		update: () => ({
			set: (set: Record<string, unknown>) => ({
				where: () => ({ op: { kind: 'update', set } as Op })
			})
		}),
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

	it('本文が空白だけで札も無ければ、空として既存メモを消す', async () => {
		const { db, ops } = fakeDb();

		const result = await saveRaceReview(
			db,
			{ raceId: 'r1', raceNote: { body: '  ' }, entries: [entry({ body: ' \n ' })] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([{ kind: 'delete' }, { kind: 'delete' }]);
		expect(result).toEqual({ saved: 0, cleared: 2 });
	});
});

describe('savePreviewNotes', () => {
	it('本文も札も無く ☆ だけでも、印をそのまま残す', async () => {
		const { db, ops } = fakeDb();

		await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: '', flow: null }, entries: [{ ...entry(), mark: '☆' }] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([
			{ kind: 'delete' },
			{ kind: 'insert', values: expect.objectContaining({ kind: 'preview', mark: '☆' }) }
		]);
	});

	it('印が無くても札だけで出走前メモを残す', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{
				raceId: 'r1',
				raceNote: { body: '', flow: null },
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
			{ raceId: 'r1', raceNote: { body: '', flow: null }, entries: [{ ...entry(), mark: null }] },
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
			{ raceId: 'r1', raceNote: { body: '開幕週で内有利になりそう。', flow: null }, entries: [] },
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
			{ raceId: 'r1', raceNote: { body: '内有利', flow: null }, entries: [] },
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

	/** 本文を書かずに展開だけ置くのは普通の使い方。印や札だけの出走前メモと同じ扱い。 */
	it('本文が空でも展開があれば見立ての行を残し、展開を一緒に書く', async () => {
		const { db, ops } = fakeDb();
		const flow: RaceFlow = { ...emptyFlow(), pace: 'スロー' };

		const result = await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: '', flow }, entries: [] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([
			{
				kind: 'insert',
				values: expect.objectContaining({ kind: 'race_preview', body: '', flow })
			}
		]);
		expect(result).toEqual({ saved: 1, cleared: 0 });
	});

	/** ふりかえりのレースのメモに展開は付かない（列に触らない）。 */
	it('ふりかえりの保存は展開の列に触らない', async () => {
		const { db, ops } = fakeDb();
		await saveRaceReview(
			db,
			{ raceId: 'r1', raceNote: { body: '実際はハイペース' }, entries: [] },
			'u1',
			'2026-09-27'
		);
		expect(ops[0]).toMatchObject({ values: { kind: 'race', flow: undefined } });
	});

	/**
	 * 出走馬が0頭のとき、展開の欄はフォームに無い（undefined）。null と読むと、
	 * 見立ての本文を直しただけで保存済みのペースとメモが消える。
	 */
	it('展開に触らない保存では、本文が空でも展開のある行は残して本文だけ空にする', async () => {
		const { db, ops } = fakeDb();

		await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: '' }, entries: [] },
			'u1',
			'2026-09-27'
		);

		// 展開の無い行だけ消し、展開のある行は本文を空にする。展開の列は書かない。
		expect(ops).toEqual([
			{ kind: 'delete' },
			{ kind: 'update', set: expect.objectContaining({ body: '' }) }
		]);
		expect(ops[1]).not.toHaveProperty('set.flow');
	});

	it('展開に触らない保存で本文があれば、展開の列を値にも更新にも入れない', async () => {
		const { db, ops } = fakeDb();

		await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: '内有利' }, entries: [] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([
			{ kind: 'insert', values: expect.objectContaining({ kind: 'race_preview', flow: undefined }) }
		]);
	});

	it('空白だけの見立ては「空」として扱い、既存の見立てを消す', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{ raceId: 'r1', raceNote: { body: ' \n ', flow: null }, entries: [] },
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
		resultCount: 16,
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
		resultCount: 16,
		raceEntryId: 'e1',
		...over
	});

	it('メモのある出走は出走行を出さない（同じレースが2行にならない）', () => {
		const rows = mergeHorseTimeline([memo()], [run()], '2026-09-27');

		expect(rows).toEqual([expect.objectContaining({ type: 'note', key: 'note:n1' })]);
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
		['2026-10-25', false]
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
