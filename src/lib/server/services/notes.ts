import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, race, raceEntry, user, type Note } from '$lib/server/db/schema';

/**
 * メモ。本アプリの中心。
 *
 * **可視性の判定は必ず SQL の WHERE 句に埋める**（architecture.md 3-6）。
 * UI 側でフィルタすると、見えてはいけない行が SSR の HTML や
 * データペイロードに乗ってしまう。DB から出さないのが唯一確実な方法。
 */
function visibleTo(viewerId: string) {
	return or(eq(note.visibility, 'shared'), eq(note.authorId, viewerId));
}

const nowSec = () => Math.floor(Date.now() / 1000);

export type NoteView = Pick<
	Note,
	| 'id'
	| 'kind'
	| 'body'
	| 'rating'
	| 'mark'
	| 'visibility'
	| 'occurredAt'
	| 'raceEntryId'
	| 'horseId'
> & { authorId: string; authorName: string };

/** レース詳細で出す全メモ（レース自体のメモ + 各馬のメモ）。1クエリ。 */
export async function listRaceNotes(db: Db, raceId: string, viewerId: string): Promise<NoteView[]> {
	return db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			rating: note.rating,
			mark: note.mark,
			visibility: note.visibility,
			occurredAt: note.occurredAt,
			raceEntryId: note.raceEntryId,
			horseId: note.horseId,
			authorId: note.authorId,
			authorName: user.displayName
		})
		.from(note)
		.innerJoin(user, eq(note.authorId, user.id))
		.where(and(eq(note.raceId, raceId), visibleTo(viewerId)))
		.orderBy(desc(note.createdAt));
}

export type RaceReviewInput = {
	raceId: string;
	/** レース自体のメモ。空文字なら「書かない／消す」。 */
	raceNote: { body: string; visibility: 'shared' | 'private' };
	entries: {
		entryId: string;
		horseId: string;
		body: string;
		rating: number | null;
		visibility: 'shared' | 'private';
	}[];
};

/**
 * ふりかえり画面の一括保存。このアプリで最もクエリ数が増える経路。
 *
 * 18頭分を個別に INSERT すると往復18回に加えて
 * 「1リクエストあたりのクエリ数上限」（Free で50）を食う。
 * `batch()` で1往復・1トランザクションにまとめる。
 *
 * 空欄の馬はスキップし、既存メモがあれば消す（＝メモを消す操作になる）。
 * `race_entry` から race_id / horse_id をコピーして note に持たせるのはここ。
 */
export async function saveRaceReview(
	db: Db,
	input: RaceReviewInput,
	authorId: string,
	occurredAt: string
): Promise<{ saved: number; cleared: number }> {
	const statements = [];
	let saved = 0;
	let cleared = 0;

	const raceBody = input.raceNote.body.trim();
	if (raceBody) {
		statements.push(
			db
				.insert(note)
				.values({
					id: ulid(),
					authorId,
					kind: 'race',
					raceId: input.raceId,
					body: raceBody,
					visibility: input.raceNote.visibility,
					occurredAt
				})
				.onConflictDoUpdate({
					target: [note.authorId, note.raceId],
					targetWhere: sql`kind = 'race'`,
					set: {
						body: raceBody,
						visibility: input.raceNote.visibility,
						occurredAt,
						updatedAt: nowSec()
					}
				})
		);
		saved++;
	} else {
		statements.push(
			db
				.delete(note)
				.where(
					and(eq(note.authorId, authorId), eq(note.raceId, input.raceId), eq(note.kind, 'race'))
				)
		);
		cleared++;
	}

	for (const e of input.entries) {
		const body = e.body.trim();

		if (body) {
			statements.push(
				db
					.insert(note)
					.values({
						id: ulid(),
						authorId,
						kind: 'entry',
						raceId: input.raceId,
						horseId: e.horseId,
						raceEntryId: e.entryId,
						body,
						rating: e.rating,
						visibility: e.visibility,
						occurredAt
					})
					.onConflictDoUpdate({
						target: [note.authorId, note.raceEntryId, note.kind],
						targetWhere: sql`race_entry_id IS NOT NULL`,
						set: {
							body,
							rating: e.rating,
							visibility: e.visibility,
							occurredAt,
							updatedAt: nowSec()
						}
					})
			);
			saved++;
		} else {
			statements.push(
				db
					.delete(note)
					.where(
						and(
							eq(note.authorId, authorId),
							eq(note.raceEntryId, e.entryId),
							eq(note.kind, 'entry')
						)
					)
			);
			cleared++;
		}
	}

	if (statements.length > 0) {
		await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	}

	return { saved, cleared };
}

export type TimelineItem = {
	id: string;
	kind: Note['kind'];
	body: string;
	rating: number | null;
	mark: Note['mark'];
	visibility: Note['visibility'];
	occurredAt: string;
	authorId: string;
	authorName: string;
	/** レース紐付きのメモだけ入る。 */
	raceId: string | null;
	raceName: string | null;
	course: string | null;
	raceNumber: number | null;
	grade: string | null;
	finishPosition: number | null;
};

/**
 * 馬のタイムライン。
 *
 * レース紐付きメモ（kind='entry'）も近況メモ（kind='horse'）も
 * `note.horse_id` で引ける。これが note を1テーブルにした狙い（design.md 第2章）。
 * マージ処理はいらない。レース名を並べたいので race / race_entry だけ LEFT JOIN する。
 * インデックスは note_horse_timeline (horse_id, occurred_at) が効く。
 */
export async function getHorseTimeline(
	db: Db,
	horseId: string,
	viewerId: string
): Promise<TimelineItem[]> {
	return db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			rating: note.rating,
			mark: note.mark,
			visibility: note.visibility,
			occurredAt: note.occurredAt,
			authorId: note.authorId,
			authorName: user.displayName,
			raceId: race.id,
			raceName: race.name,
			course: race.course,
			raceNumber: race.raceNumber,
			grade: race.grade,
			finishPosition: raceEntry.finishPosition
		})
		.from(note)
		.innerJoin(user, eq(note.authorId, user.id))
		.leftJoin(race, eq(note.raceId, race.id))
		.leftJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
		.where(and(eq(note.horseId, horseId), visibleTo(viewerId)))
		.orderBy(desc(note.occurredAt), desc(note.createdAt))
		.limit(200);
}

/** 近況メモ（レースに紐づかない馬のメモ）を足す。 */
export async function addHorseNote(
	db: Db,
	input: {
		horseId: string;
		body: string;
		rating: number | null;
		visibility: 'shared' | 'private';
		occurredAt: string;
	},
	authorId: string
): Promise<void> {
	await db.insert(note).values({
		id: ulid(),
		authorId,
		kind: 'horse',
		horseId: input.horseId,
		body: input.body.trim(),
		rating: input.rating,
		visibility: input.visibility,
		occurredAt: input.occurredAt
	});
}

/** 他人のメモは消せない。編集は作成者本人だけ（design.md 第9章 #3）。 */
export async function deleteNote(db: Db, noteId: string, authorId: string): Promise<boolean> {
	const result = await db
		.delete(note)
		.where(and(eq(note.id, noteId), eq(note.authorId, authorId)))
		.returning({ id: note.id });
	return result.length > 0;
}

export type RecentNote = TimelineItem & { horseName: string | null };

/** ダッシュボード: 最近のメモ。 */
export async function listRecentNotes(db: Db, viewerId: string, limit = 20): Promise<RecentNote[]> {
	return db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			rating: note.rating,
			mark: note.mark,
			visibility: note.visibility,
			occurredAt: note.occurredAt,
			authorId: note.authorId,
			authorName: user.displayName,
			raceId: race.id,
			raceName: race.name,
			course: race.course,
			raceNumber: race.raceNumber,
			grade: race.grade,
			finishPosition: raceEntry.finishPosition,
			horseName: horse.name
		})
		.from(note)
		.innerJoin(user, eq(note.authorId, user.id))
		.leftJoin(race, eq(note.raceId, race.id))
		.leftJoin(horse, eq(note.horseId, horse.id))
		.leftJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
		.where(visibleTo(viewerId))
		.orderBy(desc(note.createdAt))
		.limit(limit);
}

/**
 * 予想画面で出す、出走馬たちの過去メモ。
 *
 * **このレース以外の** メモを馬ごとにまとめて返す。1クエリ。
 * `note.horse_id` を非正規化してあるおかげで、16頭分の過去メモが
 * `WHERE horse_id IN (...)` で一度に引ける（design.md 第2章の非正規化の回収）。
 */
export async function listHistoryForHorses(
	db: Db,
	horseIds: string[],
	excludeRaceId: string,
	viewerId: string
): Promise<Map<string, TimelineItem[]>> {
	if (horseIds.length === 0) return new Map();

	const rows = await db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			rating: note.rating,
			mark: note.mark,
			visibility: note.visibility,
			occurredAt: note.occurredAt,
			authorId: note.authorId,
			authorName: user.displayName,
			horseId: note.horseId,
			raceId: race.id,
			raceName: race.name,
			course: race.course,
			raceNumber: race.raceNumber,
			grade: race.grade,
			finishPosition: raceEntry.finishPosition
		})
		.from(note)
		.innerJoin(user, eq(note.authorId, user.id))
		.leftJoin(race, eq(note.raceId, race.id))
		.leftJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
		.where(
			and(
				inArray(note.horseId, horseIds),
				// このレース自身のメモは履歴ではないので外す。
				or(isNull(note.raceId), ne(note.raceId, excludeRaceId)),
				visibleTo(viewerId)
			)
		)
		.orderBy(desc(note.occurredAt), desc(note.createdAt))
		.limit(500);

	const byHorse = new Map<string, TimelineItem[]>();
	for (const r of rows) {
		if (!r.horseId) continue;
		const list = byHorse.get(r.horseId) ?? [];
		list.push(r);
		byHorse.set(r.horseId, list);
	}
	return byHorse;
}

export type PreviewNoteInput = {
	raceId: string;
	entries: {
		entryId: string;
		horseId: string;
		body: string;
		rating: number | null;
		mark: '◎' | '○' | '▲' | '△' | '×' | null;
		visibility: 'shared' | 'private';
	}[];
};

/**
 * 出走前メモの一括保存。
 *
 * kind は `preview`。ふりかえりの `entry` とは一意制約が別なので、
 * **あとでふりかえりを書いても、ここで書いたメモは消えない。**
 * occurred_at はレース日にする（タイムラインでそのレースの位置に並ぶ）。
 */
export async function savePreviewNotes(
	db: Db,
	input: PreviewNoteInput,
	authorId: string,
	occurredAt: string
): Promise<{ saved: number; cleared: number }> {
	const statements = [];
	let saved = 0;
	let cleared = 0;

	for (const e of input.entries) {
		const body = e.body.trim();

		// **印だけ付けて本文を書かない**のは普通の使い方なので、
		// 本文が空でも印があれば行を残す。両方空のときだけ消す。
		if (body || e.mark) {
			statements.push(
				db
					.insert(note)
					.values({
						id: ulid(),
						authorId,
						kind: 'preview',
						raceId: input.raceId,
						horseId: e.horseId,
						raceEntryId: e.entryId,
						body,
						rating: e.rating,
						mark: e.mark,
						visibility: e.visibility,
						occurredAt
					})
					.onConflictDoUpdate({
						target: [note.authorId, note.raceEntryId, note.kind],
						targetWhere: sql`race_entry_id IS NOT NULL`,
						set: {
							body,
							rating: e.rating,
							mark: e.mark,
							visibility: e.visibility,
							updatedAt: nowSec()
						}
					})
			);
			saved++;
		} else {
			statements.push(
				db
					.delete(note)
					.where(
						and(
							eq(note.authorId, authorId),
							eq(note.raceEntryId, e.entryId),
							eq(note.kind, 'preview')
						)
					)
			);
			cleared++;
		}
	}

	if (statements.length > 0) {
		await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
	}

	return { saved, cleared };
}
