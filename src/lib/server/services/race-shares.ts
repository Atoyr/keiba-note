import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Db } from '$lib/server/db';
import { horse, note, raceEntry, raceShare, user } from '$lib/server/db/schema';
import { raceMeeting, raceSpec } from '$lib/utils/race-heading';
import { resolveFlow, hasResolvedFlow } from '$lib/utils/race-flow';
import { hasSummary, type RaceSummary } from '$lib/utils/race-summary';
import { getRace, listEntriesForPreview } from './races';

/** 本人用のまとめ。メモは必ず viewerId で絞り、共有用の項目だけを組み立てる。 */
export async function getRaceSummary(
	db: Db,
	raceId: string,
	viewerId: string
): Promise<RaceSummary | null> {
	const [race, entries, notes] = await Promise.all([
		getRace(db, raceId),
		// 展開の盤面は出走馬の id で持つので、馬番・枠・馬名に引き当てる。
		// 出走前メモを書いていない馬も盤面には置けるので、メモ側の JOIN では足りない。
		listEntriesForPreview(db, raceId),
		db
			.select({
				kind: note.kind,
				body: note.body,
				mark: note.mark,
				tags: note.tags,
				flow: note.flow,
				horseName: horse.name,
				horseNumber: raceEntry.horseNumber,
				bracket: raceEntry.bracket
			})
			.from(note)
			.leftJoin(raceEntry, eq(note.raceEntryId, raceEntry.id))
			.leftJoin(horse, eq(note.horseId, horse.id))
			.where(
				and(
					eq(note.authorId, viewerId),
					eq(note.raceId, raceId),
					inArray(note.kind, ['race_preview', 'preview'])
				)
			)
	]);
	if (!race) return null;
	const outlook = notes.find((n) => n.kind === 'race_preview');
	// 取り下げで出走馬から外れた馬は、引き当てられないので盤面から落ちる。
	const flow = outlook?.flow
		? resolveFlow(outlook.flow, new Map(entries.map((e) => [e.entryId, e])), race)
		: null;
	return {
		race: { name: race.name, meeting: raceMeeting(race), spec: raceSpec(race), grade: race.grade },
		body: outlook?.body ?? '',
		...(hasResolvedFlow(flow) ? { flow } : {}),
		rows: notes
			.filter((n) => n.kind === 'preview')
			.sort(
				(a, b) =>
					(a.horseNumber ?? 99) - (b.horseNumber ?? 99) ||
					(a.horseName ?? '').localeCompare(b.horseName ?? '', 'ja')
			)
			.flatMap((n) => {
				return n.horseName
					? [
							{
								horseName: n.horseName,
								horseNumber: n.horseNumber,
								bracket: n.bracket,
								body: n.body,
								mark: n.mark,
								tags: n.tags
							}
						]
					: [];
			})
	};
}

export async function getOwnRaceShare(db: Db, raceId: string, viewerId: string) {
	const [row] = await db
		.select({ id: raceShare.id, content: raceShare.content })
		.from(raceShare)
		.where(and(eq(raceShare.raceId, raceId), eq(raceShare.authorId, viewerId)));
	return row ?? null;
}

/** 入力された本文を共有しない。保存済みの本人の予想からコピーを作る。 */
export async function publishRaceSummary(db: Db, raceId: string, viewerId: string) {
	const content = await getRaceSummary(db, raceId, viewerId);
	if (!content || !hasSummary(content)) return null;
	const [row] = await db
		.insert(raceShare)
		.values({ id: ulid(), authorId: viewerId, raceId, content })
		.onConflictDoUpdate({
			target: [raceShare.authorId, raceShare.raceId],
			set: { content, updatedAt: Math.floor(Date.now() / 1000) }
		})
		.returning({ id: raceShare.id });
	return row;
}

export async function revokeRaceShare(db: Db, raceId: string, viewerId: string) {
	await db
		.delete(raceShare)
		.where(and(eq(raceShare.raceId, raceId), eq(raceShare.authorId, viewerId)));
}

/** 公開の読みは共有用コピーだけ。アカウントの識別子・Google名・画像・メールは選ばない。 */
export async function getSharedRaceSummary(db: Db, shareId: string) {
	const [row] = await db
		.select({
			content: raceShare.content,
			authorName: sql<string>`coalesce(${user.publicName}, '匿名')`
		})
		.from(raceShare)
		.innerJoin(user, eq(raceShare.authorId, user.id))
		.where(and(eq(raceShare.id, shareId), isNull(user.deletedAt)));
	return row ?? null;
}

export async function listRaceShares(db: Db, viewerId: string) {
	return db
		.select({ id: raceShare.id, raceId: raceShare.raceId, content: raceShare.content })
		.from(raceShare)
		.where(eq(raceShare.authorId, viewerId))
		.orderBy(desc(raceShare.updatedAt));
}
