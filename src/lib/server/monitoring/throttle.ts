/**
 * 通知の連投を抑える。同じ鍵の通知は `windowMs` のあいだ1件だけ通し、残りは数えて捨てる。
 * 次に通すときに、捨てた数を添える（`suppressed`）。
 *
 * 状態は isolate の中にしか無い。Workers は拠点ごと・負荷ごとに isolate が分かれるので、
 * 障害時でも「isolate の数 × 5分に1件」までしか抑えられない。確実に集約したくなったら、
 * 同じ `take` の形のまま Durable Objects か KV に置き換える（→ docs/monitoring.md）。
 */
export type ThrottleDecision = { send: true; suppressed: number } | { send: false };

export class AlertThrottle {
	readonly #last = new Map<string, { at: number; suppressed: number }>();
	readonly #windowMs: number;
	readonly #now: () => number;
	readonly #maxKeys: number;

	constructor(windowMs: number, now: () => number = Date.now, maxKeys = 200) {
		this.#windowMs = windowMs;
		this.#now = now;
		this.#maxKeys = maxKeys;
	}

	take(key: string): ThrottleDecision {
		const at = this.#now();
		const last = this.#last.get(key);
		if (last && at - last.at < this.#windowMs) {
			last.suppressed++;
			return { send: false };
		}
		// 鍵は event 名とルートなので増え続けはしないが、念のため上限で捨てる。
		if (!last && this.#last.size >= this.#maxKeys) this.#last.clear();
		this.#last.set(key, { at, suppressed: 0 });
		return { send: true, suppressed: last?.suppressed ?? 0 };
	}
}
