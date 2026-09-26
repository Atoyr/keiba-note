/**
 * 一括保存フォームの「変えたところ」を数える（`DraftKeeper` が使う）。
 *
 * **1件はメモ1つ。** フォームの欄は1頭につき本文・札・印と分かれているが、保存されるのは
 * 1頭ぶんのメモ1つ。欄の数で数えると、1頭に本文と札を書いただけで「未保存の変更が 2 件」になり、
 * 保存の知らせの件数と合わなくなる。欄の name は `body.<entryId>` のように
 * `.` の後ろがメモの持ち主なので、そこが同じ欄は1件にまとめる。`.` の無い欄
 * （`raceNoteBody` ＝ レースのメモ）はそれだけで1件。
 */

/** name ごとの値。札（チェックボックス）は同じ name に複数の値が乗るので配列で持つ。 */
export type FieldValues = Record<string, string[]>;

/**
 * 同じ値かどうか。前後の空白を落としてから、JSON にして比べる。
 *
 * **空白を落とすのは、サーバーが本文を `trim()` して保存するから**（services/notes.ts）。
 * 落とさずに比べると、次の2つで件数がずれる。
 * - 「xyz 」と送ると保存されるのは「xyz」で、保存のあと欄が「xyz」で描き直される。送った値を
 *   保存済みにしているので「未保存の変更が 1 件」が出たままになり、離れるときの確認も出る
 * - 空白を足しただけ・空白だけの本文でも「保存しました（1 件）」と数えるが、何も変わっていない
 * 札と印の値には空白が無いので、落としても変わらない。
 *
 * 区切り文字で連結して比べる手もあるが、本文（textarea）には何でも入るので
 * 安全な区切りが無い。並び順は DOM の順で安定しているので JSON で足りる。
 */
export const sameValue = (a: string[] | undefined, b: string[] | undefined) => {
	const key = (xs: string[] | undefined) => JSON.stringify((xs ?? []).map((x) => x.trim()));
	return key(a) === key(b);
};

/** `base` から変わった欄だけを、`now` の値で返す。`now` に無い欄は空の配列にする。 */
export function changedFields(now: FieldValues, base: FieldValues): FieldValues {
	const diff: FieldValues = {};
	for (const k of new Set([...Object.keys(now), ...Object.keys(base)])) {
		if (!sameValue(now[k], base[k])) diff[k] = now[k] ?? [];
	}
	return diff;
}

/** 見立て（`race_preview`）の1行に入る、本文以外の欄（展開の予想）。 */
const RACE_NOTE_FIELDS = /^(racePace|flowSpots\.|flowMemo\.)/;

/**
 * 欄の name から、どのメモの欄か。`body.<entryId>` と `tags.<entryId>` は同じメモ。
 *
 * name の形はサーバーとの約束でもある（`+page.server.ts` が `body.${entryId}` で読む）。
 * レースのメモに欄を足すときは、`raceNoteBody` と同じメモに数えるよう、ここも合わせる。
 */
export function noteOfField(name: string): string {
	// 展開の予想の欄（ペース・局面ごとの隊列とメモ）は、見立て（`raceNoteBody`）と同じメモの列に入る。
	// `flowSpots.start` の `.` の後ろは局面で、メモの持ち主ではない。
	if (RACE_NOTE_FIELDS.test(name)) return 'raceNoteBody';
	const dot = name.indexOf('.');
	return dot < 0 ? name : name.slice(dot + 1);
}

/** 変わった欄を、メモの数に数え直す。 */
export function countChangedNotes(diff: FieldValues): number {
	return new Set(Object.keys(diff).map(noteOfField)).size;
}
