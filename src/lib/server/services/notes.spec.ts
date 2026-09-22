import { describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import type { NoteTag } from '$lib/schemas/note';
import { saveRaceReview, savePreviewNotes } from './notes';

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
			{ raceId: 'r1', entries: [{ ...entry({ tags: ['馬場一致'] }), mark: null }] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([
			{
				kind: 'insert',
				values: expect.objectContaining({ kind: 'preview', mark: null, tags: ['馬場一致'] })
			}
		]);
		expect(result).toEqual({ saved: 1, cleared: 0 });
	});

	it('本文も印も札も無ければ消す', async () => {
		const { db, ops } = fakeDb();

		const result = await savePreviewNotes(
			db,
			{ raceId: 'r1', entries: [{ ...entry(), mark: null }] },
			'u1',
			'2026-09-27'
		);

		expect(ops).toEqual([{ kind: 'delete' }]);
		expect(result).toEqual({ saved: 0, cleared: 1 });
	});
});
