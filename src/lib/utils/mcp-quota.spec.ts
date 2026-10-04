import { describe, expect, it } from 'vitest';
import {
	formatMcpReset,
	mcpNextReset,
	mcpWeekStart,
	MCP_WEEKLY_LIMITS,
	quotaPercent
} from './mcp-quota';

/** JST の日時から Date を作る。 */
const jst = (s: string) => new Date(`${s}+09:00`);
const sec = (s: string) => jst(s).getTime() / 1000;

describe('mcpWeekStart', () => {
	// 2026-10-07 は水曜
	it('水曜 12:00 ちょうどは、その週の始まり', () => {
		expect(mcpWeekStart(jst('2026-10-07T12:00:00'))).toBe(sec('2026-10-07T12:00:00'));
	});
	it('水曜 11:59:59 は前の週の水曜 12:00', () => {
		expect(mcpWeekStart(jst('2026-10-07T11:59:59'))).toBe(sec('2026-09-30T12:00:00'));
	});
	it('木曜・日曜・火曜は直前の水曜 12:00', () => {
		expect(mcpWeekStart(jst('2026-10-08T09:00:00'))).toBe(sec('2026-10-07T12:00:00'));
		expect(mcpWeekStart(jst('2026-10-11T23:59:59'))).toBe(sec('2026-10-07T12:00:00'));
		expect(mcpWeekStart(jst('2026-10-13T20:00:00'))).toBe(sec('2026-10-07T12:00:00'));
	});
	it('月をまたいでも水曜 12:00 に揃う', () => {
		expect(mcpWeekStart(jst('2026-10-01T00:00:00'))).toBe(sec('2026-09-30T12:00:00'));
	});
});

describe('mcpNextReset', () => {
	it('週の始まりの7日後', () => {
		expect(mcpNextReset(jst('2026-10-04T10:00:00'))).toBe(sec('2026-10-07T12:00:00'));
		expect(mcpNextReset(jst('2026-10-07T12:00:00'))).toBe(sec('2026-10-14T12:00:00'));
	});
});

describe('quotaPercent', () => {
	it('0・端数切り捨て・上限', () => {
		expect(quotaPercent(0, 500)).toBe(0);
		expect(quotaPercent(123, 500)).toBe(24);
		expect(quotaPercent(7, 100)).toBe(7);
		expect(quotaPercent(499, 500)).toBe(99);
		expect(quotaPercent(500, 500)).toBe(100);
	});
	it('上限を超えても 100', () => {
		expect(quotaPercent(900, 500)).toBe(100);
	});
	it('上限は読み 500・書き 100', () => {
		expect(MCP_WEEKLY_LIMITS).toEqual({ read: 500, write: 100 });
	});
});

describe('formatMcpReset', () => {
	it('日本時間で月日・曜日・時刻', () => {
		expect(formatMcpReset(sec('2026-10-07T12:00:00'))).toBe('10月7日（水）12:00');
		expect(formatMcpReset(sec('2026-01-07T12:00:00'))).toBe('1月7日（水）12:00');
	});
});
