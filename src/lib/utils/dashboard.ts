/**
 * ダッシュボードの「次にやること」を組み立てる純ロジック。
 *
 * ダッシュボードは自分が書く場所の目次で、開いたときに知りたいのは
 * 「今週どの馬を狙うか」「どのレースの予想が済んでいて、どれのふりかえりが残っているか」。
 * 材料（出走・メモ・件数）はサービス層が引き、並べ方と言い方はここで決める。
 */

import type { NoteTag } from '$lib/schemas/note';
import { isUpcoming } from './date';

// ---------------------------------------------------------------------------
// 今週出走する注目馬
// ---------------------------------------------------------------------------

/** 次走の結論。`次走買い` / `次走消し` の札から読む。 */
export type WatchVerdict = 'buy' | 'drop';

/**
 * 注目馬の材料1行。**今週の出走1つ × 結論の札が付いた自分のメモ1件**。
 * 同じ出走に何件もメモがあれば、そのぶん行が並ぶ（新しいメモが先）。
 */
export type WatchSourceRow = {
	entryId: string;
	raceId: string;
	raceDate: string;
	course: string;
	raceNumber: number | null;
	raceName: string | null;
	grade: string | null;
	horseId: string;
	horseName: string;
	horseNumber: number | null;
	noteId: string;
	noteBody: string;
	noteTags: NoteTag[];
	noteOccurredAt: string;
};

export type WatchedRunner = Omit<WatchSourceRow, 'noteTags'> & {
	verdict: WatchVerdict;
	/** 結論を書いたメモに付いていた、結論以外の札（`不利` など）。理由として添える。 */
	reasons: NoteTag[];
};

/** 札から結論を読む。両方付いていたら買いを取る（`NOTE_TAGS` の並びと同じ優先）。 */
export function watchVerdict(tags: NoteTag[]): WatchVerdict | null {
	if (tags.includes('次走買い')) return 'buy';
	if (tags.includes('次走消し')) return 'drop';
	return null;
}

/**
 * 今週の出走ごとに、**いちばん新しい結論だけ**を採る。
 *
 * 一度「次走買い」を付けた馬でも、その後のメモで「次走消し」に変えたなら消しが正。
 * 古い札まで拾うと、見限った馬がいつまでも注目馬に出続ける。
 * `rows` は新しいメモが先に並んでいる前提（サービス層が `occurred_at` の降順で返す）。
 *
 * 並びは出走の早い順（日付 → R → 馬番）。今週の予定表として上から読めるように。
 */
export function pickWatchlist(rows: WatchSourceRow[]): WatchedRunner[] {
	const byEntry = new Map<string, WatchedRunner>();

	for (const { noteTags, ...row } of rows) {
		if (byEntry.has(row.entryId)) continue;
		const verdict = watchVerdict(noteTags);
		if (!verdict) continue;
		byEntry.set(row.entryId, {
			...row,
			verdict,
			reasons: noteTags.filter((t) => t !== '次走買い' && t !== '次走消し')
		});
	}

	return [...byEntry.values()].sort(
		(a, b) =>
			a.raceDate.localeCompare(b.raceDate) ||
			(a.raceNumber ?? 0) - (b.raceNumber ?? 0) ||
			(a.horseNumber ?? Infinity) - (b.horseNumber ?? Infinity)
	);
}

// ---------------------------------------------------------------------------
// レースの進み具合
// ---------------------------------------------------------------------------

/** レース1本ぶんの、自分のメモの件数（種類別）。 */
export type RaceProgressSource = {
	date: string;
	/** 見立て（`race_preview`）。0 か 1。 */
	outlookCount: number;
	/** 印を付けた出走前メモの数。 */
	markCount: number;
	/** ふりかえり（`race` と `entry`）の数。 */
	reviewCount: number;
};

export type ProgressTone = 'done' | 'todo' | 'none';

export type ProgressLabel = { label: string; tone: ProgressTone };

/**
 * 一覧の行に添える進み具合。「メモ 3」では**何が済んでいて何が残っているか**が読めない。
 *
 * - 開催前 — 見立てと印。どちらも無ければ「未着手」
 * - 開催後（当日を含む）— ふりかえりが済んだか。予想だけして書いていなければ「ふりかえり待ち」
 *
 * 開催後に何も書いていないレースには何も添えない。ダッシュボードは重賞以外も並べるので、
 * 予想していないレースにまで「未着手」を付けると、全部が宿題に見える。
 */
export function raceProgress(r: RaceProgressSource, today: string): ProgressLabel[] {
	if (isUpcoming(r.date, today)) {
		const labels: ProgressLabel[] = [];
		if (r.outlookCount > 0) labels.push({ label: '見立て済', tone: 'done' });
		if (r.markCount > 0) labels.push({ label: `印 ${r.markCount}頭`, tone: 'done' });
		return labels.length > 0 ? labels : [{ label: '未着手', tone: 'none' }];
	}

	if (r.reviewCount > 0) return [{ label: 'ふりかえり済', tone: 'done' }];
	if (predicted(r)) return [{ label: 'ふりかえり待ち', tone: 'todo' }];
	return [];
}

function predicted(r: RaceProgressSource): boolean {
	return r.outlookCount > 0 || r.markCount > 0;
}

/**
 * ふりかえり待ち。**予想した（見立てか印がある）のに、走ったあとに何も書いていない**レース。
 *
 * 「開催済みでふりかえりが無いレース」を全部出すと、データで入っている重賞が全部並んで
 * 宿題の山になる。予想したレースに絞れば、答え合わせをしに行くべきものだけが残る。
 * 並びは新しい順（終わったばかりのものから）。
 */
export function awaitingReview<T extends RaceProgressSource>(races: T[], today: string): T[] {
	return races
		.filter((r) => !isUpcoming(r.date, today) && r.reviewCount === 0 && predicted(r))
		.sort((a, b) => b.date.localeCompare(a.date));
}
