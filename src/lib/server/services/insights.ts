import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { isUniqueViolation } from '$lib/server/db/errors';
import {
	insightWord,
	race,
	raceEntry,
	raceEntryInsight,
	type RaceEntry
} from '$lib/server/db/schema';
import { INSIGHT_ATTACHED_LIMIT, INSIGHT_WORDS_LIMIT } from '$lib/schemas/insight';
import { raceResultCount } from './races';

/**
 * レース直後の気づき。**本人だけのもの**で、読む・書く関数は viewerId を必須で受け、
 * WHERE に `user_id = :viewer` を入れる（architecture.md 第0章）。
 *
 * 言葉の登録（`insight_word`）は全レース共通。馬に付けた言葉は文字列のコピーで持つので、
 * 登録を消しても過去の記録は残る。
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

/** 登録を消す。すでに馬へ付けた記録には触らない。 */
export async function removeInsightWord(db: Db, viewerId: string, word: string): Promise<void> {
	await db
		.delete(insightWord)
		.where(and(eq(insightWord.userId, viewerId), eq(insightWord.word, word)));
}

// ---------------------------------------------------------------------------
// 馬に付ける
// ---------------------------------------------------------------------------

export type InsightTarget = { entryId: string; raceId: string; horseId: string; date: string };

/** この出走馬がこのレースのものか、レース日と馬も 1 クエリで。別のレースの出走馬は null（他のレースへ書き込ませない）。 */
export async function getInsightTarget(
	db: Db,
	raceId: string,
	entryId: string
): Promise<InsightTarget | null> {
	const rows = await db
		.select({
			entryId: raceEntry.id,
			raceId: raceEntry.raceId,
			horseId: raceEntry.horseId,
			date: race.date
		})
		.from(raceEntry)
		.innerJoin(race, eq(raceEntry.raceId, race.id))
		.where(and(eq(raceEntry.id, entryId), eq(raceEntry.raceId, raceId)))
		.limit(1);
	return rows[0] ?? null;
}

const nowSql = sql`(unixepoch())`;

function ownRow(viewerId: string, entryId: string) {
	return and(eq(raceEntryInsight.userId, viewerId), eq(raceEntryInsight.raceEntryId, entryId));
}

/** 言葉もメモも空になった行を消す。 */
function deleteEmpty(db: Db, viewerId: string, entryId: string) {
	return db
		.delete(raceEntryInsight)
		.where(
			and(
				ownRow(viewerId, entryId),
				sql`${raceEntryInsight.words} = '[]'`,
				eq(raceEntryInsight.memo, '')
			)
		);
}

function currentValue(db: Db, viewerId: string, entryId: string) {
	return db
		.select({ words: raceEntryInsight.words, memo: raceEntryInsight.memo })
		.from(raceEntryInsight)
		.where(ownRow(viewerId, entryId));
}

type Batch = Parameters<Db['batch']>[0];

async function runAndRead(
	db: Db,
	viewerId: string,
	entryId: string,
	statements: unknown[]
): Promise<InsightValue> {
	const read = currentValue(db, viewerId, entryId);
	const results = (await db.batch([
		...statements,
		read
	] as unknown as Batch)) as unknown as unknown[];
	const rows = results[results.length - 1] as InsightValue[];
	return rows[0] ?? { words: [], memo: '' };
}

/**
 * 言葉を付ける（`on`）・外す（`!on`）。**読んでから書く形にしない**：1 回の `batch` で
 * 「無ければ足す」「あれば除く」を SQL の中で済ませ、連続して押した 2 つが互いを上書きしないようにする。
 * 付けようとした言葉がすでにあるか、1 頭の上限（`INSIGHT_ATTACHED_LIMIT`）なら何もしない。
 * 返すのは書いたあとの値（行が無ければ空）。
 */
export async function setInsightWord(
	db: Db,
	viewerId: string,
	target: InsightTarget,
	word: string,
	on: boolean
): Promise<InsightValue> {
	if (on) {
		const add = db
			.insert(raceEntryInsight)
			.values({
				userId: viewerId,
				raceEntryId: target.entryId,
				raceId: target.raceId,
				horseId: target.horseId,
				words: [word],
				memo: '',
				occurredAt: target.date
			})
			.onConflictDoUpdate({
				target: [raceEntryInsight.userId, raceEntryInsight.raceEntryId],
				set: {
					words: sql`CASE WHEN EXISTS (SELECT 1 FROM json_each(${raceEntryInsight.words}) WHERE value = ${word}) OR json_array_length(${raceEntryInsight.words}) >= ${INSIGHT_ATTACHED_LIMIT} THEN ${raceEntryInsight.words} ELSE json_insert(${raceEntryInsight.words}, '$[#]', ${word}) END`,
					updatedAt: nowSql
				}
			});
		return runAndRead(db, viewerId, target.entryId, [add]);
	}
	const remove = db
		.update(raceEntryInsight)
		.set({
			words: sql`(SELECT json_group_array(value) FROM json_each(${raceEntryInsight.words}) WHERE value <> ${word})`,
			updatedAt: nowSql
		})
		.where(ownRow(viewerId, target.entryId));
	return runAndRead(db, viewerId, target.entryId, [
		remove,
		deleteEmpty(db, viewerId, target.entryId)
	]);
}

/** 自由入力の気づきを置き換える。`words` には触らない。空で言葉も無ければ行ごと消す。 */
export async function setInsightMemo(
	db: Db,
	viewerId: string,
	target: InsightTarget,
	memo: string
): Promise<InsightValue> {
	const upsert = db
		.insert(raceEntryInsight)
		.values({
			userId: viewerId,
			raceEntryId: target.entryId,
			raceId: target.raceId,
			horseId: target.horseId,
			words: [],
			memo,
			occurredAt: target.date
		})
		.onConflictDoUpdate({
			target: [raceEntryInsight.userId, raceEntryInsight.raceEntryId],
			set: { memo, updatedAt: nowSql }
		});
	return runAndRead(db, viewerId, target.entryId, [
		upsert,
		deleteEmpty(db, viewerId, target.entryId)
	]);
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
