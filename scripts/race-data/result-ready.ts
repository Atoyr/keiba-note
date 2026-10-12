import type { ResultRow } from './netkeiba.ts';

/** 着順が数字でない行の、確定した表記（取消・除外・中止・失格。略した1文字も）。 */
const SETTLED_STATUS = /^(取|取消|除|除外|中|中止|失|失格)$/;

/**
 * 結果の表がまだ確定していないなら、その理由。確定していれば null。
 *
 * 結果の Cron（開催日の JST 18:05）は1日1回なので、確定前や途中の表を書くと、そのまま PR になる。
 * 1着がいない・着順も取消などの表記も読めない行がある表は書かずに止める。
 * 表に YAML の馬がいない・YAML にいない馬がいる、は確定とは別の話なので、ここでは見ない
 * （`applyResult` がログに出し、PR を見る人が確かめる）。
 */
export function resultNotSettled(rows: ResultRow[]): string | null {
	if (rows.length === 0) return '結果がまだ出ていません';
	if (!rows.some((row) => row.finish === 1)) return '結果の表に1着がまだいません（確定前）';
	const unread = rows.filter(
		(row) => row.finish === undefined && !SETTLED_STATUS.test(row.status ?? '')
	);
	if (unread.length > 0) {
		return `着順も取消・除外などの表記も読めない馬がいます（確定前か、ページの形が変わった）: ${unread.map((row) => row.name).join('・')}`;
	}
	return null;
}
