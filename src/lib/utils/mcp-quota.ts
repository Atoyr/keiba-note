/**
 * MCP（AI との連携）の週ごとの利用上限。画面とサーバーの両方から使う純粋な関数。
 *
 * 数えるのは tool の呼び出し（`tools/call`）で、単位はユーザー（連携ごとではない）。
 * 週の区切りは水曜 12:00（日本時間）。JST は UTC+9 固定なので、水曜 03:00 UTC に当たる。
 */

/** 1週間に使える回数。読み取りと書き込みで別の枠。数字を変えるのはここだけ。 */
export const MCP_WEEKLY_LIMITS = { read: 500, write: 100 } as const;

export type McpQuotaKind = 'read' | 'write';

const DAY = 86400;
const WEEK = 7 * DAY;
const JST_OFFSET = 9 * 3600;
/** 1970-01-07（水）03:00 UTC。週の区切りの1つ。1970-01-01 は木曜。 */
const WEEK_ANCHOR = 6 * DAY + 3 * 3600;

/** `now` 以前で最も近い、水曜 12:00 JST の unix 秒。ちょうど 12:00 はその週の始まり。 */
export function mcpWeekStart(now: Date): number {
	const t = Math.floor(now.getTime() / 1000);
	return Math.floor((t - WEEK_ANCHOR) / WEEK) * WEEK + WEEK_ANCHOR;
}

/** 次に 0 に戻る時刻（unix 秒）。 */
export function mcpNextReset(now: Date): number {
	return mcpWeekStart(now) + WEEK;
}

/** 使った割合（%）。端数は切り捨て、0〜100 に収める。 */
export function quotaPercent(used: number, limit: number): number {
	if (limit <= 0) return 100;
	return Math.min(100, Math.max(0, Math.floor((used / limit) * 100)));
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** `10月8日（水）12:00`（日本時間）。 */
export function formatMcpReset(unix: number): string {
	const d = new Date((unix + JST_OFFSET) * 1000);
	const hh = String(d.getUTCHours()).padStart(2, '0');
	const mm = String(d.getUTCMinutes()).padStart(2, '0');
	return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS[d.getUTCDay()]}）${hh}:${mm}`;
}
