import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';
import { isUniqueViolation } from '#lib/server/db/errors.ts';
import {
	insightWord,
	race,
	raceEntry,
	raceEntryInsight,
	type RaceEntry
} from '#lib/server/db/schema.ts';
import { INSIGHT_WORDS_LIMIT } from '#lib/schemas/insight.ts';
import { raceResultCount } from './races';

/**
 * クイック入力の言葉の登録（`insight_word`。全レース共通）と、以前に残した気づき（`race_entry_insight`）を読む関数。
 * **本人だけのもの**で、読む・書く関数は viewerId を必須で受け、WHERE に `user_id = :viewer` を入れる（architecture.md 第0章）。
 *
 * 気づきは新しくは作らない（クイック入力は言葉をふりかえりメモの本文に入れる）。すでに残した分は読むだけで残す。
 */

/** 馬に付いた言葉と自由入力。画面・タイムライン共通。 */
export type InsightValue = { words: string[]; memo: string };

// ---------------------------------------------------------------------------
// 言葉の登録
// ---------------------------------------------------------------------------

/** 登録した言葉。登録順（同じ秒なら rowid）。 */
export function insightWordsQuery(db: Db, viewerId: string) {
	return db
		.select({ word: insightWord.word })
		.from(insightWord)
		.where(eq(insightWord.userId, viewerId))
		.orderBy(asc(insightWord.createdAt), sql`rowid`);
}

export async function listInsightWords(db: Db, viewerId: string): Promise<string[]> {
	return (await insightWordsQuery(db, viewerId)).map((r) => r.word);
}

/** 言葉を登録する。上限（`limit`）と重複（`duplicate`）は例外でなく値で返す。 */
export async function addInsightWord(
	db: Db,
	viewerId: string,
	word: string
): Promise<{ ok: true } | { ok: false; reason: 'limit' | 'duplicate' }> {
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)` })
		.from(insightWord)
		.where(eq(insightWord.userId, viewerId));
	if (n >= INSIGHT_WORDS_LIMIT) return { ok: false, reason: 'limit' };
	try {
		await db.insert(insightWord).values({ userId: viewerId, word });
	} catch (e) {
		if (isUniqueViolation(e)) return { ok: false, reason: 'duplicate' };
		throw e;
	}
	return { ok: true };
}

/**
 * 言葉をまとめて登録する（おすすめのセット用）。渡した順に、まだ登録していない言葉を、上限までの残りの数だけ足す。
 * 入りきらなかった言葉があれば `limited`。残りが0なら何も足さない。
 */
export async function addInsightWords(
	db: Db,
	viewerId: string,
	words: string[]
): Promise<{ added: string[]; limited: boolean }> {
	const have = new Set(await listInsightWords(db, viewerId));
	const fresh = [...new Set(words)].filter((w) => !have.has(w));
	const room = Math.max(0, INSIGHT_WORDS_LIMIT - have.size);
	const added = fresh.slice(0, room);
	if (added.length > 0) {
		// 実際に入った言葉だけを返す（同時に同じ言葉が入っていて飛んだ分は数えない）。
		const inserted = await db
			.insert(insightWord)
			.values(added.map((word) => ({ userId: viewerId, word })))
			.onConflictDoNothing()
			.returning({ word: insightWord.word });
		const got = new Set(inserted.map((r) => r.word));
		return { added: added.filter((w) => got.has(w)), limited: fresh.length > added.length };
	}
	return { added: [], limited: fresh.length > 0 };
}

/** 登録を消す。すでに馬へ付けた記録には触らない。 */
export async function removeInsightWord(db: Db, viewerId: string, word: string): Promise<void> {
	await db
		.delete(insightWord)
		.where(and(eq(insightWord.userId, viewerId), eq(insightWord.word, word)));
}

// ---------------------------------------------------------------------------
// 画面で読む
// ---------------------------------------------------------------------------

/** このレースの自分の気づき。ふりかえり画面の行に出す。 */
export function raceInsightsQuery(db: Db, raceId: string, viewerId: string) {
	return db
		.select({
			entryId: raceEntryInsight.raceEntryId,
			words: raceEntryInsight.words,
			memo: raceEntryInsight.memo
		})
		.from(raceEntryInsight)
		.where(and(eq(raceEntryInsight.userId, viewerId), eq(raceEntryInsight.raceId, raceId)));
}

/** 出走馬たちの、ほかのレースの気づき。新しい順の 500 件まで（メモの履歴と同じ）。 */
export function pastInsightsQuery(
	db: Db,
	horseIds: string[],
	excludeRaceId: string,
	viewerId: string
) {
	return db
		.select({
			entryId: raceEntryInsight.raceEntryId,
			words: raceEntryInsight.words,
			memo: raceEntryInsight.memo
		})
		.from(raceEntryInsight)
		.where(
			and(
				eq(raceEntryInsight.userId, viewerId),
				inArray(raceEntryInsight.horseId, horseIds),
				ne(raceEntryInsight.raceId, excludeRaceId)
			)
		)
		.orderBy(desc(raceEntryInsight.occurredAt), desc(raceEntryInsight.createdAt))
		.limit(500);
}

/** 出走ID → 気づき。 */
export function insightsByEntry(rows: { entryId: string; words: string[]; memo: string }[]) {
	return new Map(rows.map((r) => [r.entryId, { words: r.words, memo: r.memo }]));
}

/** 馬のタイムラインに並ぶ気づき1件。 */
export type TimelineInsight = InsightValue & {
	raceEntryId: string;
	raceId: string;
	occurredAt: string;
	raceName: string | null;
	course: string;
	raceNumber: number | null;
	grade: string | null;
	className: string | null;
	finishPosition: RaceEntry['finishPosition'];
	/** 着順の入った出走の数。リンク先（予想かふりかえりか）を決める。 */
	resultCount: number;
};

/** 馬のタイムライン用。新しい順の 200 件まで。 */
export async function listHorseInsights(
	db: Db,
	horseId: string,
	viewerId: string
): Promise<TimelineInsight[]> {
	return db
		.select({
			raceEntryId: raceEntryInsight.raceEntryId,
			raceId: raceEntryInsight.raceId,
			occurredAt: raceEntryInsight.occurredAt,
			words: raceEntryInsight.words,
			memo: raceEntryInsight.memo,
			raceName: race.name,
			course: race.course,
			raceNumber: race.raceNumber,
			grade: race.grade,
			className: race.className,
			finishPosition: raceEntry.finishPosition,
			resultCount: raceResultCount()
		})
		.from(raceEntryInsight)
		.innerJoin(race, eq(raceEntryInsight.raceId, race.id))
		.innerJoin(raceEntry, eq(raceEntryInsight.raceEntryId, raceEntry.id))
		.where(and(eq(raceEntryInsight.userId, viewerId), eq(raceEntryInsight.horseId, horseId)))
		.orderBy(desc(raceEntryInsight.occurredAt), desc(raceEntryInsight.createdAt))
		.limit(200);
}
