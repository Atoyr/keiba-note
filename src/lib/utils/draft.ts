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
 * 同じ値かどうか。JSON にして比べる。
 *
 * 区切り文字で連結して比べる手もあるが、本文（textarea）には何でも入るので
 * 安全な区切りが無い。並び順は DOM の順で安定しているので JSON で足りる。
 */
export const sameValue = (a: string[] | undefined, b: string[] | undefined) =>
	JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** `base` から変わった欄だけを、`now` の値で返す。`now` に無い欄は空の配列にする。 */
export function changedFields(now: FieldValues, base: FieldValues): FieldValues {
	const diff: FieldValues = {};
	for (const k of new Set([...Object.keys(now), ...Object.keys(base)])) {
		if (!sameValue(now[k], base[k])) diff[k] = now[k] ?? [];
	}
	return diff;
}

/** 欄の name から、どのメモの欄か。`body.<entryId>` と `tags.<entryId>` は同じメモ。 */
export function noteOfField(name: string): string {
	const dot = name.indexOf('.');
	return dot < 0 ? name : name.slice(dot + 1);
}

/** 変わった欄を、メモの数に数え直す。 */
export function countChangedNotes(diff: FieldValues): number {
	return new Set(Object.keys(diff).map(noteOfField)).size;
}
