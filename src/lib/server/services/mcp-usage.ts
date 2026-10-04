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

type Meter = { used: number; limit: number; percent: number };

export type McpUsage = {
	read: Meter;
	write: Meter;
	/** 次に 0 に戻る時刻（unix 秒）。 */
	resetAt: number;
};

const meter = (used: number, limit: number): Meter => ({
	used,
	limit,
	percent: quotaPercent(used, limit)
});

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
	return {
		read: meter(current?.reads ?? 0, MCP_WEEKLY_LIMITS.read),
		write: meter(current?.writes ?? 0, MCP_WEEKLY_LIMITS.write),
		resetAt: mcpNextReset(now)
	};
}

/**
 * 今週の行があるユーザーの利用量（管理画面用）。前週の行は 0 と同じなので含めない。
 * 行を持つのは AI を使ったユーザーだけなので、件数は少ない。
 */
export async function listWeeklyMcpUsage(
	db: Db,
	now: Date = new Date()
): Promise<Map<string, { read: Meter; write: Meter }>> {
	const rows = await db
		.select({ userId: mcpUsage.userId, reads: mcpUsage.reads, writes: mcpUsage.writes })
		.from(mcpUsage)
		.where(eq(mcpUsage.weekStart, mcpWeekStart(now)))
		.limit(1000);
	return new Map(
		rows.map((r) => [
			r.userId,
			{
				read: meter(r.reads, MCP_WEEKLY_LIMITS.read),
				write: meter(r.writes, MCP_WEEKLY_LIMITS.write)
			}
		])
	);
}

/** 管理者のリセット。行を消す（次の呼び出しで 0 から作り直される）。消した行があったかを返す。 */
export async function resetMcpUsage(db: Db, userId: string): Promise<boolean> {
	const rows = await db
		.delete(mcpUsage)
		.where(eq(mcpUsage.userId, userId))
		.returning({ userId: mcpUsage.userId });
	return rows.length > 0;
}
