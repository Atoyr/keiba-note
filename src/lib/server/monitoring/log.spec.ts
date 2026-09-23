import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, writeLog } from './log';

afterEach(() => {
	vi.restoreAllMocks();
});

/** Drizzle の DrizzleQueryError と同じ形（message に params が載る）。 */
function drizzleError(params: string, cause: unknown) {
	const e = new Error(`Failed query: insert into note (body) values (?)\nparams: ${params}`, {
		cause
	});
	e.stack = `Error: ${e.message}\n    at D1Session.run (session.js:1:1)\n    at saveRaceReview (notes.ts:2:2)`;
	return e;
}

describe('describeError', () => {
	it('Drizzle のエラーからバインドした値（メモの本文）を落とす', () => {
		const e = drizzleError('逃げ馬の\n本文です,01J8X', new Error('D1_ERROR: database is locked'));

		const summary = describeError(e);

		expect(summary.message).toBe(
			'Failed query: insert into note (body) values (?)\nparams: [redacted]'
		);
		expect(JSON.stringify(summary)).not.toContain('本文です');
		expect(JSON.stringify(summary)).not.toContain('逃げ馬');
		// 値だけを落とし、どこで落ちたかは残す。
		expect(summary.stack).toContain('at saveRaceReview');
	});

	it('cause を辿って D1 の本当の理由を残す', () => {
		const summary = describeError(drizzleError('x', new Error('D1_ERROR: no such column: y')));

		expect(summary.causes).toEqual(['Error: D1_ERROR: no such column: y']);
	});

	it('Error でない値も文字列にする', () => {
		expect(describeError('boom')).toEqual({ name: 'string', message: 'boom' });
		expect(describeError(undefined)).toEqual({ name: 'undefined', message: 'undefined' });
	});

	it('長いメッセージは切る', () => {
		expect(describeError(new Error('あ'.repeat(2000))).message.length).toBeLessThanOrEqual(501);
	});
});

describe('writeLog', () => {
	it('level に合わせて console のメソッドを選び、オブジェクトのまま渡す', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		writeLog({ level: 'error', event: 'a', message: 'x' });
		writeLog({ level: 'warn', event: 'b', message: 'y' });
		writeLog({ level: 'info', event: 'c', message: 'z' });

		expect(error).toHaveBeenCalledWith({ level: 'error', event: 'a', message: 'x' });
		expect(warn).toHaveBeenCalledWith({ level: 'warn', event: 'b', message: 'y' });
		expect(log).toHaveBeenCalledWith({ level: 'info', event: 'c', message: 'z' });
	});
});
