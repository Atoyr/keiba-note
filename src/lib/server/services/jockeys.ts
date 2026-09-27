import { and, asc, countDistinct, desc, eq, isNotNull, like, max, ne, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { horse, jockeyNote, note, race, raceEntry, type Note } from '$lib/server/db/schema';
import { JOCKEY_TAGS, type JockeyTag } from '$lib/schemas/jockey';
import type { NoteTag } from '$lib/schemas/note';
import { raceResultCount } from './races';

/**
 * 騎手。
 *
 * **騎手はマスタの表を持たない。** 出走馬（`race_entry.jockey`）の名前で束ねる
 * （schema.ts の `jockeyNote` の注記）。騎乗は全ユーザー共通のマスタなので誰が見ても同じで、
 * そこに重ねるメモとまとめ（`jockey_note`）だけが viewer のもの。
 *
 * **メモとまとめを読む関数は viewerId を必須で受け、WHERE に入れる**（architecture.md 第0章）。
 */

export type JockeyListItem = {
	name: string;
	/** 入っている騎乗の数。過去走は気にしている馬しか入らないので、騎手の全騎乗ではない。 */
	rideCount: number;
	/** 最後に乗った（乗る予定の）日。 */
	lastRideDate: string;
	/** その騎手の騎乗に viewer が書いたメモ（出走前・ふりかえり）の数。 */
	noteCount: number;
	/** viewer がまとめに付けた札。 */
	tags: JockeyTag[];
};

/** 一覧に出す騎手の数。超えたら名前か札で絞ってもらう（画面で断る）。 */
export const JOCKEY_LIST_LIMIT = 200;

export type JockeyFilter = { q: string; tag: JockeyTag | null };

/**
 * 騎手の一覧。名前の部分一致と、自分が付けた札で絞る。騎乗の多い順。1クエリ。
 *
 * メモの件数とまとめの札は **viewer 自身のものだけ**（`listHorses` と同じ。他人が何か書いていることを漏らさない）。
 * 札は JSON の配列なので引用符ごと LIKE で当てる（`listWatchSources` と同じ。札の名前は互いに部分を含まない）。
 */
export async function listJockeys(
	db: Db,
	viewerId: string,
	filter: JockeyFilter
): Promise<JockeyListItem[]> {
	const q = filter.q.trim();
	const rows = await db
		.select({
			name: raceEntry.jockey,
			rideCount: countDistinct(raceEntry.id),
			lastRideDate: max(race.date),
			noteCount: countDistinct(note.id),
			tags: jockeyNote.tags
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.leftJoin(note, and(eq(note.raceEntryId, raceEntry.id), eq(note.authorId, viewerId)))
		.leftJoin(
			jockeyNote,
			and(eq(jockeyNote.userId, viewerId), eq(jockeyNote.jockey, raceEntry.jockey))
		)
		.where(
			and(
				isNotNull(raceEntry.jockey),
				ne(raceEntry.jockey, ''),
				q ? like(raceEntry.jockey, `%${q}%`) : undefined,
				filter.tag ? like(jockeyNote.tags, `%"${filter.tag}"%`) : undefined
			)
		)
		.groupBy(raceEntry.jockey, jockeyNote.tags)
		.orderBy(desc(countDistinct(raceEntry.id)), asc(raceEntry.jockey))
		.limit(JOCKEY_LIST_LIMIT);

	return rows.map((r) => ({
		name: r.name ?? '',
		rideCount: r.rideCount,
		lastRideDate: r.lastRideDate ?? '',
		noteCount: r.noteCount,
		tags: r.tags ?? []
	}));
}

/**
 * viewer がどれかの騎手に付けている札（`JOCKEY_TAGS` の順）。一覧の「札で絞る」に並べる。
 * 付けていない札で絞っても0件になるだけなので、選択肢は使っている札に限る。
 */
export async function listJockeyTagsInUse(db: Db, viewerId: string): Promise<JockeyTag[]> {
	const rows = await db
		.select({ tags: jockeyNote.tags })
		.from(jockeyNote)
		.where(eq(jockeyNote.userId, viewerId));
	const used = new Set(rows.flatMap((r) => r.tags));
	return JOCKEY_TAGS.filter((t) => used.has(t));
}

/** 騎手のタイムラインに並べる1騎乗。メモが無くても出す。 */
export type JockeyRide = {
	/** race_entry.id。同じ出走に対するメモと突き合わせる鍵。 */
	entryId: string;
	raceId: string;
	date: string;
	course: string;
	raceNumber: number | null;
	raceName: string | null;
	grade: string | null;
	className: string | null;
	horseId: string;
	horseName: string;
	bracket: number | null;
	horseNumber: number | null;
	finishPosition: number | null;
	popularity: number | null;
	/** そのレースで着順の入った出走の数（→ `isSettled`）。 */
	resultCount: number;
};

/** 1騎手の騎乗が何件まで出るか。超えたら古いほうを出さない（画面で断る）。 */
export const JOCKEY_RIDE_LIMIT = 300;

/**
 * 騎手の騎乗。新しい順（日付 → R の降順）。**メモの有無を見ない。**
 *
 * 全ユーザー共通のマスタなので viewerId を取らない。索引は entry_jockey (jockey)。
 */
export async function listJockeyRides(
	db: Db,
	name: string,
	limit = JOCKEY_RIDE_LIMIT
): Promise<JockeyRide[]> {
	return db
		.select({
			entryId: raceEntry.id,
			raceId: race.id,
			date: race.date,
			course: race.course,
			raceNumber: race.raceNumber,
			raceName: race.name,
			grade: race.grade,
			className: race.className,
			horseId: horse.id,
			horseName: horse.name,
			bracket: raceEntry.bracket,
			horseNumber: raceEntry.horseNumber,
			finishPosition: raceEntry.finishPosition,
			popularity: raceEntry.popularity,
			resultCount: raceResultCount()
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.innerJoin(horse, eq(raceEntry.horseId, horse.id))
		.where(eq(raceEntry.jockey, name))
		.orderBy(desc(race.date), desc(race.raceNumber))
		.limit(limit);
}

/** 騎乗に付いた viewer のメモ（出走前 `preview` とふりかえり `entry`）。 */
export type JockeyRideNote = Pick<Note, 'id' | 'kind' | 'body' | 'mark' | 'visibility'> & {
	tags: NoteTag[];
	raceEntryId: string;
};

/**
 * その騎手が乗った出走に viewer が書いたメモ。1クエリ。
 *
 * 馬のメモのうち**その騎乗に付いたものだけ**を拾う（race_entry_id で突き合わせる）。
 * 近況メモ（`horse`）は騎乗に付かないので出さない。別の騎手が乗った走りのメモも出さない。
 */
export async function listJockeyRideNotes(
	db: Db,
	name: string,
	viewerId: string
): Promise<JockeyRideNote[]> {
	const rows = await db
		.select({
			id: note.id,
			kind: note.kind,
			body: note.body,
			tags: note.tags,
			mark: note.mark,
			visibility: note.visibility,
			raceEntryId: raceEntry.id
		})
		.from(note)
		.innerJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
		.where(and(eq(note.authorId, viewerId), eq(raceEntry.jockey, name)))
		.orderBy(asc(note.createdAt));
	return rows;
}

/**
 * 騎乗の数。`listJockeyRides` は新しいほうから上限までしか返さないので、見出しの数はこちらで数える
 * （一覧の騎乗数と同じ数になるように）。
 */
export async function countJockeyRides(db: Db, name: string): Promise<number> {
	const rows = await db
		.select({ n: countDistinct(raceEntry.id) })
		.from(raceEntry)
		.where(eq(raceEntry.jockey, name));
	return rows.at(0)?.n ?? 0;
}

/** その名前の騎乗が1つでもあるか（無い騎手の画面は 404）。 */
export async function jockeyExists(db: Db, name: string): Promise<boolean> {
	const rows = await db
		.select({ id: raceEntry.id })
		.from(raceEntry)
		.where(eq(raceEntry.jockey, name))
		.limit(1);
	return rows.length > 0;
}

export type JockeySummary = { body: string; tags: JockeyTag[] };

/** viewer がその騎手に書いたまとめ。無ければ null。 */
export async function getJockeySummary(
	db: Db,
	name: string,
	viewerId: string
): Promise<JockeySummary | null> {
	const rows = await db
		.select({ body: jockeyNote.body, tags: jockeyNote.tags })
		.from(jockeyNote)
		.where(and(eq(jockeyNote.userId, viewerId), eq(jockeyNote.jockey, name)))
		.limit(1);
	return rows.at(0) ?? null;
}

/**
 * まとめを書く（1人・1騎手につき1本。編集＝上書き）。**本文も札も空なら消す。**
 * 札だけ付けておく（「中山巧者」だけ）のは普通の使い方なので、本文が空でも札があれば残す。
 * 騎手がいるかはルートが先に確かめる。
 */
export async function saveJockeySummary(
	db: Db,
	name: string,
	input: JockeySummary,
	userId: string
): Promise<'saved' | 'cleared'> {
	const body = input.body.trim();
	const mine = and(eq(jockeyNote.userId, userId), eq(jockeyNote.jockey, name));

	if (!body && input.tags.length === 0) {
		await db.delete(jockeyNote).where(mine);
		return 'cleared';
	}

	await db
		.insert(jockeyNote)
		.values({ userId, jockey: name, body, tags: input.tags })
		.onConflictDoUpdate({
			target: [jockeyNote.userId, jockeyNote.jockey],
			set: { body, tags: input.tags, updatedAt: sql`(unixepoch())` }
		});
	return 'saved';
}

export type JockeyTimelineRow = {
	ride: JockeyRide;
	/** まだ日が来ていない騎乗。当日は予定にしない（馬のタイムラインと同じ線引き）。 */
	upcoming: boolean;
	/** この騎乗に付いたメモ。出走前 → ふりかえりの順（書く順）。 */
	notes: JockeyRideNote[];
};

const KIND_ORDER: Partial<Record<Note['kind'], number>> = { preview: 0, entry: 1 };

/**
 * 騎手のタイムライン。**骨は騎乗で、メモは騎乗の下に重ねる。**
 *
 * 馬のタイムラインはメモの行が出走の行の代わりになるが、こちらは同じ騎乗に「どの馬で」が要るので、
 * 騎乗の行を残してメモをその中に入れる。並びは騎乗の順（未来 → 過去）のまま。
 */
export function mergeJockeyTimeline(
	rides: JockeyRide[],
	notes: JockeyRideNote[],
	today: string
): JockeyTimelineRow[] {
	const byEntry = new Map<string, JockeyRideNote[]>();
	for (const n of notes) byEntry.set(n.raceEntryId, [...(byEntry.get(n.raceEntryId) ?? []), n]);
	const order = (n: JockeyRideNote) => KIND_ORDER[n.kind] ?? 9;

	return rides.map((ride) => ({
		ride,
		upcoming: ride.date > today,
		notes: [...(byEntry.get(ride.entryId) ?? [])].sort((a, b) => order(a) - order(b))
	}));
}
