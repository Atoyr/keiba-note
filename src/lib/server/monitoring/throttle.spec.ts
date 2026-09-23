import { describe, expect, it } from 'vitest';
import { AlertThrottle } from './throttle';

function clock(start = 0) {
	let t = start;
	return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('AlertThrottle', () => {
	it('同じ鍵は窓のあいだ1件だけ通し、次に通すときに捨てた数を添える', () => {
		const c = clock();
		const throttle = new AlertThrottle(1000, c.now);

		expect(throttle.take('d1.query.failed')).toEqual({ send: true, suppressed: 0 });
		c.advance(500);
		expect(throttle.take('d1.query.failed')).toEqual({ send: false });
		expect(throttle.take('d1.query.failed')).toEqual({ send: false });
		c.advance(500);
		expect(throttle.take('d1.query.failed')).toEqual({ send: true, suppressed: 2 });
	});

	it('鍵が違えば互いに抑えない', () => {
		const throttle = new AlertThrottle(1000, clock().now);

		expect(throttle.take('a').send).toBe(true);
		expect(throttle.take('b').send).toBe(true);
	});

	it('鍵が上限に達したら忘れてやり直す（増え続けない）', () => {
		const throttle = new AlertThrottle(1000, clock().now, 2);

		throttle.take('a');
		throttle.take('b');
		throttle.take('c');

		expect(throttle.take('a').send).toBe(true);
	});
});
