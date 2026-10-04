import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Db } from '$lib/server/db';
import { createTestDb } from '$lib/server/db/test-d1';
import { MCP_WEEKLY_LIMITS, mcpNextReset, mcpWeekStart } from '$lib/utils/mcp-quota';
import { consumeMcpQuota, getMcpUsage, listWeeklyMcpUsage, resetMcpUsage } from './mcp-usage';

let db: Db;
let sqlite: DatabaseSync;

const NOW = new Date('2026-10-04T10:00:00+09:00'); // 日曜
const NEXT_WEEK = new Date('2026-10-07T12:00:00+09:00'); // 水曜 12:00（新しい週）
const WEEK = mcpWeekStart(NOW);

const row = (userId: string) =>
	sqlite
		.prepare('SELECT week_start, reads, writes FROM mcp_usage WHERE user_id = ?')
		.get(userId) as { week_start: number; reads: number; writes: number } | undefined;

beforeEach(() => {
	({ db, sqlite } = createTestDb());
	sqlite.exec(`INSERT INTO user (id, google_sub, email, display_name) VALUES
		('A', 'ga', 'a@example.invalid', 'A'), ('B', 'gb', 'b@example.invalid', 'B');`);
});

const put = (userId: string, weekStart: number, reads: number, writes: number) =>
	sqlite
		.prepare(
			'INSERT OR REPLACE INTO mcp_usage (user_id, week_start, reads, writes, updated_at) VALUES (?,?,?,?,0)'
		)
		.run(userId, weekStart, reads, writes);

describe('consumeMcpQuota', () => {
	it('1回で1つ増える', async () => {
		expect(await consumeMcpQuota(db, 'A', 'read', NOW)).toEqual({ ok: true });
		expect(row('A')).toMatchObject({ week_start: WEEK, reads: 1, writes: 0 });
		await consumeMcpQuota(db, 'A', 'read', NOW);
		expect(row('A')).toMatchObject({ reads: 2, writes: 0 });
	});

	it('読みと書きは別の枠', async () => {
		put('A', WEEK, MCP_WEEKLY_LIMITS.read, 0);
		expect(await consumeMcpQuota(db, 'A', 'read', NOW)).toMatchObject({ ok: false });
		expect(await consumeMcpQuota(db, 'A', 'write', NOW)).toEqual({ ok: true });
		expect(row('A')).toMatchObject({ reads: MCP_WEEKLY_LIMITS.read, writes: 1 });
	});

	it('上限ちょうどで断り、数は増えない。次に戻る時刻と上限を返す', async () => {
		put('A', WEEK, MCP_WEEKLY_LIMITS.read - 1, MCP_WEEKLY_LIMITS.write);
		expect(await consumeMcpQuota(db, 'A', 'read', NOW)).toEqual({ ok: true });
		expect(await consumeMcpQuota(db, 'A', 'read', NOW)).toEqual({
			ok: false,
			limit: MCP_WEEKLY_LIMITS.read,
			resetAt: mcpNextReset(NOW)
		});
		expect(await consumeMcpQuota(db, 'A', 'write', NOW)).toMatchObject({
			ok: false,
			limit: MCP_WEEKLY_LIMITS.write
		});
		expect(row('A')).toMatchObject({
			reads: MCP_WEEKLY_LIMITS.read,
			writes: MCP_WEEKLY_LIMITS.write
		});
	});

	it('週をまたぐと 0 から数え直す（前週に上限だった行でも通る）', async () => {
		put('A', WEEK, MCP_WEEKLY_LIMITS.read, MCP_WEEKLY_LIMITS.write);
		expect(await consumeMcpQuota(db, 'A', 'read', NEXT_WEEK)).toEqual({ ok: true });
		expect(row('A')).toMatchObject({ week_start: mcpWeekStart(NEXT_WEEK), reads: 1, writes: 0 });
		expect(await consumeMcpQuota(db, 'A', 'write', NEXT_WEEK)).toEqual({ ok: true });
		expect(row('A')).toMatchObject({ reads: 1, writes: 1 });
	});

	it('ほかのユーザーには効かない', async () => {
		put('A', WEEK, MCP_WEEKLY_LIMITS.read, 0);
		expect(await consumeMcpQuota(db, 'B', 'read', NOW)).toEqual({ ok: true });
		expect(row('B')).toMatchObject({ reads: 1 });
		expect(row('A')).toMatchObject({ reads: MCP_WEEKLY_LIMITS.read });
	});
});

describe('getMcpUsage / resetMcpUsage', () => {
	it('行が無ければ 0%。次に戻る時刻を返す', async () => {
		expect(await getMcpUsage(db, 'A', NOW)).toEqual({
			read: { used: 0, limit: 500, percent: 0 },
			write: { used: 0, limit: 100, percent: 0 },
			resetAt: mcpNextReset(NOW)
		});
	});

	it('今週の行は % にする。前週の行は 0', async () => {
		put('A', WEEK, 123, 7);
		const u = await getMcpUsage(db, 'A', NOW);
		expect(u.read).toEqual({ used: 123, limit: 500, percent: 24 });
		expect(u.write).toEqual({ used: 7, limit: 100, percent: 7 });
		expect((await getMcpUsage(db, 'A', NEXT_WEEK)).read.used).toBe(0);
	});

	it('リセットすると 0 に戻り、また数えられる。無ければ false', async () => {
		put('A', WEEK, MCP_WEEKLY_LIMITS.read, MCP_WEEKLY_LIMITS.write);
		expect(await resetMcpUsage(db, 'A')).toBe(true);
		expect(row('A')).toBeUndefined();
		expect((await getMcpUsage(db, 'A', NOW)).read.percent).toBe(0);
		expect(await consumeMcpQuota(db, 'A', 'read', NOW)).toEqual({ ok: true });
		expect(await resetMcpUsage(db, 'B')).toBe(false);
	});

	it('リセットはほかのユーザーの行に触れない', async () => {
		put('A', WEEK, 5, 5);
		put('B', WEEK, 9, 9);
		await resetMcpUsage(db, 'A');
		expect(row('B')).toMatchObject({ reads: 9, writes: 9 });
	});
});

describe('listWeeklyMcpUsage', () => {
	it('今週の行があるユーザーだけを、回数と % で返す。前週の行は含めない', async () => {
		put('A', WEEK, 1, 0);
		put('B', WEEK - 7 * 86400, 500, 100);
		const m = await listWeeklyMcpUsage(db, NOW);
		expect([...m.keys()]).toEqual(['A']);
		expect(m.get('A')).toEqual({
			read: { used: 1, limit: 500, percent: 0 },
			write: { used: 0, limit: 100, percent: 0 }
		});
		expect((await listWeeklyMcpUsage(db, NEXT_WEEK)).size).toBe(0);
	});
});
