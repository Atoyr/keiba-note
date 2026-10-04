import { describe, expect, it } from 'vitest';
import { SEED_MIDNIGHT_MARGIN_MS, waitBeforeSeed, webServerTimeout } from './seed';

/** JST の日時を渡して Date にする。 */
const jst = (time: string) => new Date(`2026-10-04T${time}+09:00`);

describe('waitBeforeSeed', () => {
	it('0 時まで 15 分より残っていれば待たない', () => {
		expect(waitBeforeSeed(jst('23:44:59'))).toBe(0);
		expect(waitBeforeSeed(jst('12:00:00'))).toBe(0);
	});

	it('0 時まで 15 分ちょうどなら、0 時を過ぎて 5 秒まで待つ', () => {
		expect(waitBeforeSeed(jst('23:45:00'))).toBe(SEED_MIDNIGHT_MARGIN_MS + 5000);
	});

	it('0 時の直前は、残りと 5 秒を待つ', () => {
		expect(waitBeforeSeed(jst('23:59:30'))).toBe(35_000);
	});

	it('0 時を過ぎていれば待たない', () => {
		expect(waitBeforeSeed(jst('00:00:00'))).toBe(0);
	});
});

describe('webServerTimeout', () => {
	const extended = 60_000 + SEED_MIDNIGHT_MARGIN_MS + 5000;

	it('0 時から遠ければ Playwright の既定値のまま', () => {
		expect(webServerTimeout(jst('12:00:00'))).toBe(60_000);
		expect(webServerTimeout(jst('00:00:00'))).toBe(60_000);
	});

	it('設定を読んだ直後に seed が待つ範囲へ入りうるなら、待ちの最大ぶんを足す', () => {
		expect(webServerTimeout(jst('23:43:59'))).toBe(60_000);
		expect(webServerTimeout(jst('23:44:30'))).toBe(extended);
	});

	it('0 時の直前も、待ちの最大ぶんを足す', () => {
		expect(webServerTimeout(jst('23:59:59'))).toBe(extended);
	});
});
