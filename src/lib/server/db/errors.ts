/**
 * D1 / Drizzle のエラー判定。
 *
 * Drizzle は元のエラーを `Failed query: ...` で包んで投げるため、
 * `String(e)` には SQLite のメッセージが出てこない。`cause` を辿る必要がある。
 */

/** エラーとその cause 連鎖をメッセージの塊にする。 */
function messageChain(e: unknown, depth = 0): string {
	if (depth > 5 || e === null || e === undefined) return '';
	if (typeof e === 'string') return e;
	if (e instanceof Error) {
		return `${e.message} ${messageChain(e.cause, depth + 1)}`;
	}
	return String(e);
}

/** UNIQUE 制約違反か。呼び出し側で 409 に振り替えるために使う。 */
export function isUniqueViolation(e: unknown): boolean {
	const m = messageChain(e);
	return m.includes('UNIQUE constraint failed') || m.includes('SQLITE_CONSTRAINT_UNIQUE');
}

/** CHECK 制約違反か。note の kind と列の組み合わせが壊れたときに出る。 */
export function isCheckViolation(e: unknown): boolean {
	const m = messageChain(e);
	return m.includes('CHECK constraint failed') || m.includes('SQLITE_CONSTRAINT_CHECK');
}

/** どの UNIQUE インデックスで落ちたかを見たいとき用。 */
export function violatedIndex(e: unknown): string | null {
	const m = messageChain(e);
	const hit = /UNIQUE constraint failed: ([\w.,\s]+)/.exec(m);
	return hit?.[1]?.trim() ?? null;
}
