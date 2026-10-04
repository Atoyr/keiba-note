import { eq, lt, ne, or, sql } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { mcpUsage } from '$lib/server/db/schema';
import {
	MCP_WEEKLY_LIMITS,
	mcpNextReset,
	mcpWeekStart,
	quotaPercent,
	type McpQuotaKind
} from '$lib/utils/mcp-quota';

/**
 * MCP の tool の呼び出しの週ごとの回数（1人1行。上限と週の区切りは `utils/mcp-quota.ts`）。
 * 数えるのはユーザーごとで、連携ごとではない。
 */

export type McpQuotaResult = { ok: true } | { ok: false; limit: number; resetAt: number };

/**
 * 1回分を数える。上限に達していれば数えずに断る。
 *
 * **1クエリで数えて判定する。** 読んでから書くと、並んだ呼び出しがどちらも上限の手前を読んで通り、上限を超える。
 * INSERT … ON CONFLICT DO UPDATE の WHERE で「週が違う、または該当の列が上限より小さい」ときだけ更新し、
 * 行が返らなければ上限。週が変わっていれば、もう片方の列も 0 に戻してから今回の分を 1 にする。
 */
export async function consumeMcpQuota(
	db: Db,
	userId: string,
	kind: McpQuotaKind,
	now: Date = new Date()
): Promise<McpQuotaResult> {
	const weekStart = mcpWeekStart(now);
	const limit = MCP_WEEKLY_LIMITS[kind];
	const nowSec = Math.floor(now.getTime() / 1000);
	const r = kind === 'read' ? 1 : 0;
	const w = kind === 'write' ? 1 : 0;
	const column = kind === 'read' ? mcpUsage.reads : mcpUsage.writes;

	const rows = await db
		.insert(mcpUsage)
		.values({ userId, weekStart, reads: r, writes: w, updatedAt: nowSec })
		.onConflictDoUpdate({
			target: mcpUsage.userId,
			set: {
				reads: sql`CASE WHEN ${mcpUsage.weekStart} = ${weekStart} THEN ${mcpUsage.reads} + ${r} ELSE ${r} END`,
				writes: sql`CASE WHEN ${mcpUsage.weekStart} = ${weekStart} THEN ${mcpUsage.writes} + ${w} ELSE ${w} END`,
				weekStart,
				updatedAt: nowSec
			},
			setWhere: or(ne(mcpUsage.weekStart, weekStart), lt(column, limit))
		})
		.returning({ userId: mcpUsage.userId });

	if (rows.length > 0) return { ok: true };
	return { ok: false, limit, resetAt: mcpNextReset(now) };
}

export type McpUsage = {
	read: { used: number; limit: number; percent: number };
	write: { used: number; limit: number; percent: number };
	/** 次に 0 に戻る時刻（unix 秒）。 */
	resetAt: number;
};

/** 今週の使った回数と割合。行が無い・週が違えば 0。 */
export async function getMcpUsage(
	db: Db,
	userId: string,
	now: Date = new Date()
): Promise<McpUsage> {
	const [row] = await db
		.select({ weekStart: mcpUsage.weekStart, reads: mcpUsage.reads, writes: mcpUsage.writes })
		.from(mcpUsage)
		.where(eq(mcpUsage.userId, userId))
		.limit(1);
	const current = row && row.weekStart === mcpWeekStart(now) ? row : null;
	const reads = current?.reads ?? 0;
	const writes = current?.writes ?? 0;
	return {
		read: {
			used: reads,
			limit: MCP_WEEKLY_LIMITS.read,
			percent: quotaPercent(reads, MCP_WEEKLY_LIMITS.read)
		},
		write: {
			used: writes,
			limit: MCP_WEEKLY_LIMITS.write,
			percent: quotaPercent(writes, MCP_WEEKLY_LIMITS.write)
		},
		resetAt: mcpNextReset(now)
	};
}

/** 管理者のリセット。行を消す（次の呼び出しで 0 から作り直される）。消した行があったかを返す。 */
export async function resetMcpUsage(db: Db, userId: string): Promise<boolean> {
	const rows = await db
		.delete(mcpUsage)
		.where(eq(mcpUsage.userId, userId))
		.returning({ userId: mcpUsage.userId });
	return rows.length > 0;
}
