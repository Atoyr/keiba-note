import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, race, raceEntry, user, type Note } from '$lib/server/db/schema';
import type { NoteTag } from '$lib/schemas/note';
import type { HorseRun } from './races';

/**
 * メモ。本アプリの中心。
 *
 * **ログイン中の読みは例外なく自分のメモだけに閉じる**（design.md 第2章 2-2）。
 * `visibility` はここでは一切見ない。見てよいのは共有ページ `/notes/[id]` だけで、
 * それは `getSharedNote` に分けてある。
 *
 * この形の弱点は「絞り忘れ＝全ユーザーに見える」になること。
 * `shared` を混ぜていた頃は絞り忘れても他人の private までは出なかったが、
 * いまは条件が1本抜けるだけで全員のメモが出る。
 * **だから読み取り関数は viewerId を必須引数で受け取る。**
 * 省略可能にしたり既定値を与えたりした時点で、この防波堤は消える。
 */
function ownedBy(viewerId: string) {
	return eq(note.authorId, viewerId);
}

const nowSec = () => Math.floor(Date.now() / 1000);

export type NoteView = Pick<
	Note,
	'id' | 'kind' | 'body' | 'tags' | 'mark' | 'visibility' | 'occurredAt' | 'raceEntryId' | 'horseId'
> & { authorId: string; authorName: string };

/** レース詳細で出す全メモ（レース自体のメモ + 各馬のメモ）。1クエリ。 */
export async function listRaceNotes(db: Db, raceId: string, viewerId: string): Promise<NoteView[]> {
	return db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			tags: note.tags,
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
		.where(and(eq(note.raceId, raceId), ownedBy(viewerId)))
		.orderBy(desc(note.createdAt));
}

export type RaceReviewInput = {
	raceId: string;
	/** レース自体のメモ。空文字なら「書かない／消す」。 */
	raceNote: { body: string };
	entries: {
		entryId: string;
		horseId: string;
		body: string;
		tags: NoteTag[];
	}[];
};

/**
 * ふりかえり画面の一括保存。このアプリで最もクエリ数が増える経路。
 *
 * 18頭分を個別に INSERT すると往復18回に加えて
 * 「1リクエストあたりのクエリ数上限」（Free で50）を食う。
 * `batch()` で1往復・1トランザクションにまとめる。
 *
 * 本文も札も空の馬はスキップし、既存メモがあれば消す（＝メモを消す操作になる）。
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
					occurredAt
				})
				.onConflictDoUpdate({
					target: [note.authorId, note.raceId],
					targetWhere: sql`kind = 'race'`,
					set: {
						body: raceBody,
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

		// **札だけ付けて本文を書かない**のは普通の使い方（「不利」だけ残す）なので、
		// 本文が空でも札があれば行を残す。両方空のときだけ消す。
		if (body || e.tags.length > 0) {
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
						tags: e.tags,
						occurredAt
					})
					.onConflictDoUpdate({
						target: [note.authorId, note.raceEntryId, note.kind],
						targetWhere: sql`race_entry_id IS NOT NULL`,
						set: {
							body,
							tags: e.tags,
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
	tags: NoteTag[];
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

/** タイムラインに出すメモ1件。出走行との突き合わせに race_entry_id が要る。 */
export type TimelineNote = TimelineItem & { raceEntryId: string | null };

/**
 * 馬のタイムラインに並ぶメモ。
 *
 * レース紐付きメモ（kind='entry'）も近況メモ（kind='horse'）も
 * `note.horse_id` で引ける。これが note を1テーブルにした狙い（design.md 第2章）。
 * メモ同士のマージ処理はいらない。レース名を並べたいので race / race_entry だけ
 * LEFT JOIN する。インデックスは note_author_horse (author_id, horse_id, occurred_at)。
 *
 * **出走そのものはここには出てこない。** メモの無い出走を骨に足すのは
 * `mergeHorseTimeline`（races.ts の `listRunsForHorse` と突き合わせる）。
 */
export async function getHorseTimeline(
	db: Db,
	horseId: string,
	viewerId: string
): Promise<TimelineNote[]> {
	return db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			tags: note.tags,
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
			raceEntryId: note.raceEntryId
		})
		.from(note)
		.innerJoin(user, eq(note.authorId, user.id))
		.leftJoin(race, eq(note.raceId, race.id))
		.leftJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
		.where(and(eq(note.horseId, horseId), ownedBy(viewerId)))
		.orderBy(desc(note.occurredAt), desc(note.createdAt))
		.limit(200);
}

export type TimelineRow =
	| { key: string; occurredAt: string; type: 'note'; note: TimelineNote }
	| { key: string; occurredAt: string; type: 'run'; upcoming: boolean; run: HorseRun };

/** 同じ日付に並んだときの順。メモを先に、メモの無い出走を後ろに。 */
function rank(row: TimelineRow): number {
	return row.type === 'note' ? 0 : 1;
}

/**
 * 馬タイムラインの組み立て。**メモと出走を1本の流れにする。**
 *
 * 骨は出走（`runs`）で、そこにメモ（`notes`）を重ねる。
 * **メモのある出走は出走行を出さない。** メモ行がレース名も着順も持っているので、
 * 同じレースが2行になるだけになる。突き合わせは race_entry_id で行う
 * （1つの出走に出走前メモとふりかえりメモの2件が付くことがあるので、
 * 「1件でもあれば出走行は出さない」= 集合で持つ）。
 *
 * 並びは **未来 → 過去**（occurred_at の降順）。次走が先頭に来て、古い走りほど下に沈む。
 * メモの occurred_at はレース紐付きならレース日なので、メモ行と出走行は同じ軸で混ざる。
 *
 * `today` を引数で受けるのは、「出走予定」の判定を呼び出し側の時計に寄せるため
 * （JST の今日は `todayJst()`。design.md 第9章 #7）。**当日は「予定」にしない**：
 * 朝に開いたときは予定でも、走り終えた夕方には予定ではない。日付だけでは決められないので、
 * その日のうちは過去と同じ見せ方にして、着順が入った時点で着順が出るようにする。
 */
export function mergeHorseTimeline(
	notes: TimelineNote[],
	runs: HorseRun[],
	today: string
): TimelineRow[] {
	const noted = new Set(notes.map((n) => n.raceEntryId).filter((id) => id !== null));

	const rows: TimelineRow[] = [
		...notes.map((note) => ({
			key: `note:${note.id}`,
			occurredAt: note.occurredAt,
			type: 'note' as const,
			note
		})),
		...runs
			.filter((run) => !noted.has(run.entryId))
			.map((run) => ({
				key: `run:${run.entryId}`,
				occurredAt: run.date,
				type: 'run' as const,
				upcoming: run.date > today,
				run
			}))
	];

	// sort は安定なので、同じ日付の中では元の並び（メモは occurred_at → created_at の降順、
	// 出走は日付 → R の降順）がそのまま残る。
	return rows.sort((a, b) =>
		a.occurredAt === b.occurredAt ? rank(a) - rank(b) : a.occurredAt < b.occurredAt ? 1 : -1
	);
}

/** 近況メモ（レースに紐づかない馬のメモ）を足す。 */
export async function addHorseNote(
	db: Db,
	input: {
		horseId: string;
		body: string;
		tags: NoteTag[];
		occurredAt: string;
	},
	authorId: string
): Promise<void> {
	// visibility は既定の private。共有は書いたあとの別操作（setNoteVisibility）。
	await db.insert(note).values({
		id: ulid(),
		authorId,
		kind: 'horse',
		horseId: input.horseId,
		body: input.body.trim(),
		tags: input.tags,
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
			tags: note.tags,
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
		.where(ownedBy(viewerId))
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
			tags: note.tags,
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
				ownedBy(viewerId)
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
		tags: NoteTag[];
		mark: '◎' | '○' | '▲' | '△' | '×' | null;
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

		// **印や札だけ付けて本文を書かない**のは普通の使い方なので、
		// 本文が空でもどちらかがあれば行を残す。すべて空のときだけ消す。
		if (body || e.mark || e.tags.length > 0) {
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
						tags: e.tags,
						mark: e.mark,
						occurredAt
					})
					.onConflictDoUpdate({
						target: [note.authorId, note.raceEntryId, note.kind],
						targetWhere: sql`race_entry_id IS NOT NULL`,
						set: {
							body,
							tags: e.tags,
							mark: e.mark,
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

// ---------------------------------------------------------------------------
// 共有
// ---------------------------------------------------------------------------

export type SharedNote = {
	id: string;
	kind: Note['kind'];
	body: string;
	tags: NoteTag[];
	mark: Note['mark'];
	occurredAt: string;
	authorName: string;
	horseName: string | null;
	raceDate: string | null;
	raceName: string | null;
	course: string | null;
	raceNumber: number | null;
	grade: string | null;
	finishPosition: number | null;
};

/**
 * 共有ページ `/notes/[id]` が読む1件。
 *
 * **このアプリで visibility を見る唯一の場所。** 他のすべての読みは
 * `ownedBy(viewerId)` で自分のメモに閉じている（design.md 第2章 2-2）。
 *
 * 条件にログイン状態を入れないのが要点。著者が開いても第三者が開いても同じ行が出るので、
 * 人に渡す前に自分で踏んで見え方を確かめられる。自分のメモでも private なら出ない。
 * 呼び出し側は null を **404** にすること（403 にすると「その ID は在る」と漏れる）。
 */
export async function getSharedNote(db: Db, noteId: string): Promise<SharedNote | null> {
	const rows = await db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			tags: note.tags,
			mark: note.mark,
			occurredAt: note.occurredAt,
			authorName: user.displayName,
			horseName: horse.name,
			raceDate: race.date,
			raceName: race.name,
			course: race.course,
			raceNumber: race.raceNumber,
			grade: race.grade,
			finishPosition: raceEntry.finishPosition
		})
		.from(note)
		.innerJoin(user, eq(note.authorId, user.id))
		.leftJoin(race, eq(note.raceId, race.id))
		.leftJoin(horse, eq(note.horseId, horse.id))
		.leftJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
		.where(and(eq(note.id, noteId), eq(note.visibility, 'unlisted')))
		.limit(1);

	return rows.at(0) ?? null;
}

/**
 * 共有を始める／やめる。
 *
 * `author_id` を条件に入れているので、他人のメモを勝手に共有することはできない。
 * 該当が無ければ false（存在しないのか他人のものなのかは呼び出し側に教えない）。
 *
 * private に戻せば `/notes/[id]` は即 404 になる。ただし **URL は変わらない**ので、
 * 再共有すると以前渡した相手がまた見られる（design.md 第9章 #11）。
 */
export async function setNoteVisibility(
	db: Db,
	noteId: string,
	authorId: string,
	visibility: Note['visibility']
): Promise<boolean> {
	const result = await db
		.update(note)
		.set({ visibility, updatedAt: nowSec() })
		.where(and(eq(note.id, noteId), eq(note.authorId, authorId)))
		.returning({ id: note.id });
	return result.length > 0;
}

/** いま共有しているメモの一覧（/settings/shares）。取り消す場所。 */
export async function listSharedNotes(db: Db, viewerId: string): Promise<RecentNote[]> {
	return db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			tags: note.tags,
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
		.where(and(ownedBy(viewerId), eq(note.visibility, 'unlisted')))
		.orderBy(desc(note.updatedAt))
		.limit(200);
}
