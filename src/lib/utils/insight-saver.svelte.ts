/**
 * レース直後の気づき（馬に付ける言葉と短いメモ）の自動保存。
 *
 * ふりかえり本文は `SaveBar` の一括保存のまま（pages.md 3-1）。気づきだけは 1 操作ごとに小さく、
 * 1 回ぶんが失敗しても何が落ちたかが行に残るので、1 操作 1 リクエストで送る。
 *
 * - **馬ごとに直列。** 1 つ送って応答を確定値にしてから次を送る。応答待ちのあいだの押し直しは、
 *   未送信の操作を上書きする。送る前に確定値と同じになった操作は捨てる。
 * - **押した直後に保存済みに見せない。** 押した言葉はすぐ「押された」状態にするが、`unsaved`（破線）で
 *   サーバーの応答が来るまで区別する。
 * - **失敗しても操作は消さない。** 未送信の操作を端末（`localStorage`）に置き、再読み込みしても復元する（`restore()`）。
 *   復元したものは自動では送らず `failed` にして、「もう一度保存する」を押してもらう（復元は明示）。
 *   `localStorage` が使えなくても動く。
 *
 * 送る処理（`send`）は注入する。ブラウザの `fetch` は `insight-send.ts`。
 */

export type InsightValue = { words: string[]; memo: string };

/** 馬ごとの、未送信の操作。言葉は「付ける（true）・外す（false）」、メモは書いた文。 */
export type InsightPending = { words: Record<string, boolean>; memo?: string };

export type InsightOp =
	| { kind: 'word'; entryId: string; word: string; on: boolean }
	| { kind: 'memo'; entryId: string; memo: string };

export type InsightSend = (op: InsightOp, opts: { keepalive: boolean }) => Promise<InsightValue>;

export type InsightStatus = 'idle' | 'saving' | 'saved' | 'failed';

export type InsightWordView = { word: string; pressed: boolean; unsaved: boolean };

type Row = {
	/** サーバーが確かめた値。 */
	words: string[];
	memo: string;
	pending: InsightPending;
	inflight: boolean;
	failed: boolean;
	saved: boolean;
	/** メモのデバウンスが済んで、送ってよいか。 */
	memoReady: boolean;
	keepalive: boolean;
	/** 最後に打った文そのまま（前後の空白を含む）。サーバーは空白を除いて返すので、欄にはこちらを出し続ける（打ちかけの空白が消えない）。 */
	typed: string | null;
};

/** メモを打ち止めてから送るまで。打つたびに送ると、1 文字ごとにリクエストが飛ぶ。 */
export const MEMO_DEBOUNCE_MS = 600;

const emptyRow = (value?: InsightValue): Row => ({
	words: value?.words ?? [],
	memo: value?.memo ?? '',
	pending: { words: {} },
	inflight: false,
	failed: false,
	saved: false,
	memoReady: false,
	keepalive: false,
	typed: null
});

const hasPending = (p: InsightPending) => Object.keys(p.words).length > 0 || p.memo !== undefined;

export class InsightSaver {
	rows = $state<Record<string, Row>>({});

	readonly #storageKey: string;
	readonly #send: InsightSend;
	/** メモのデバウンスのタイマー。表示に関わらないので、リアクティブにしない。 */
	readonly #timers: Record<string, ReturnType<typeof setTimeout>> = {};

	constructor(opts: {
		storageKey: string;
		initial: Record<string, InsightValue>;
		send: InsightSend;
	}) {
		this.#storageKey = opts.storageKey;
		this.#send = opts.send;
		for (const [id, v] of Object.entries(opts.initial)) this.rows[id] = emptyRow(v);
	}

	/**
	 * 前の画面で送り切れなかった操作を端末から読み戻す。**ブラウザで mount したあとに呼ぶ**
	 * （サーバーの描画には端末の値が無く、hydration の前に読むと食い違う）。
	 * 自動では送らず、`failed` にして「もう一度保存する」を出す。
	 */
	restore(): void {
		this.#restore();
	}

	// ---- 表示 -------------------------------------------------------------

	/** いま押されている言葉か。未送信の操作があればそれが先、無ければ確定値。 */
	#pressed(row: Row | undefined, word: string): boolean {
		if (!row) return false;
		return word in row.pending.words ? row.pending.words[word] : row.words.includes(word);
	}

	/**
	 * 行に出す言葉。登録した言葉を登録順に、続けて「登録に無いが付いている／付けようとしている」言葉
	 * （登録を消した言葉も、付いているあいだは押せる札として出して外せるようにする）。
	 */
	words(entryId: string, registered: readonly string[]): InsightWordView[] {
		const row = this.rows[entryId];
		const seen: string[] = [];
		const out: InsightWordView[] = [];
		const add = (word: string) => {
			if (seen.includes(word)) return;
			seen.push(word);
			const pressed = this.#pressed(row, word);
			const unsaved =
				!!row && word in row.pending.words && row.pending.words[word] !== row.words.includes(word);
			out.push({ word, pressed, unsaved });
		};
		registered.forEach(add);
		if (row) {
			for (const word of row.words) add(word);
			for (const word of Object.keys(row.pending.words)) if (row.pending.words[word]) add(word);
		}
		return out;
	}

	/** いま見える気づきのメモ。打った文があればそのまま、無ければ確定値。 */
	memo(entryId: string): string {
		const row = this.rows[entryId];
		return row?.pending.memo ?? row?.typed ?? row?.memo ?? '';
	}

	/** メモの文がサーバーに届いていないか。 */
	memoUnsaved(entryId: string): boolean {
		const row = this.rows[entryId];
		return row?.pending.memo !== undefined && row.pending.memo.trim() !== row.memo;
	}

	status(entryId: string): InsightStatus {
		const row = this.rows[entryId];
		if (!row) return 'idle';
		if (row.failed) return 'failed';
		if (row.inflight || hasPending(row.pending)) return 'saving';
		return row.saved ? 'saved' : 'idle';
	}

	// ---- 操作 -------------------------------------------------------------

	/** 言葉を押す。付いていれば外し、無ければ付ける。すぐ送る。 */
	toggle(entryId: string, word: string): void {
		const row = this.#ensure(entryId);
		row.pending.words[word] = !this.#pressed(row, word);
		row.saved = false;
		this.#persist();
		void this.#drain(entryId);
	}

	/** メモを書く。打ち止めて 600ms で送る。 */
	setMemo(entryId: string, memo: string): void {
		const row = this.#ensure(entryId);
		row.pending.memo = memo;
		row.typed = memo;
		row.memoReady = false;
		row.saved = false;
		this.#persist();
		this.#clearTimer(entryId);
		this.#timers[entryId] = setTimeout(() => {
			delete this.#timers[entryId];
			this.flushMemo(entryId);
		}, MEMO_DEBOUNCE_MS);
	}

	/** デバウンスを待たずにメモを送る（欄を離れたとき）。 */
	flushMemo(entryId: string): void {
		const row = this.rows[entryId];
		if (!row || row.pending.memo === undefined) return;
		this.#clearTimer(entryId);
		row.memoReady = true;
		void this.#drain(entryId);
	}

	/** 失敗した行をもう一度送る。 */
	retry(entryId: string): void {
		const row = this.rows[entryId];
		if (!row) return;
		row.memoReady = true;
		void this.#drain(entryId);
	}

	/** 失敗している行をすべて送り直す（オンラインに戻ったとき）。 */
	retryFailed(): void {
		for (const [id, row] of Object.entries(this.rows)) if (row.failed) this.retry(id);
	}

	/** 画面を離れる前に、未送信のものをすべて送り始める。 */
	flushAll(opts: { keepalive?: boolean } = {}): void {
		for (const [id, row] of Object.entries(this.rows)) {
			if (!hasPending(row.pending)) continue;
			this.#clearTimer(id);
			row.memoReady = true;
			if (opts.keepalive) row.keepalive = true;
			void this.#drain(id);
		}
	}

	dispose(): void {
		for (const id of Object.keys(this.#timers)) this.#clearTimer(id);
	}

	// ---- 送る -------------------------------------------------------------

	#ensure(entryId: string): Row {
		if (!this.rows[entryId]) this.rows[entryId] = emptyRow();
		return this.rows[entryId];
	}

	#clearTimer(entryId: string) {
		const t = this.#timers[entryId];
		if (t !== undefined) clearTimeout(t);
		delete this.#timers[entryId];
	}

	/** 確定値と同じになった操作を捨てる。 */
	#prune(row: Row) {
		for (const [word, on] of Object.entries(row.pending.words)) {
			if (on === row.words.includes(word)) delete row.pending.words[word];
		}
		if (row.pending.memo !== undefined && row.pending.memo.trim() === row.memo) {
			delete row.pending.memo;
		}
	}

	#next(entryId: string, row: Row): InsightOp | null {
		this.#prune(row);
		const word = Object.keys(row.pending.words)[0];
		if (word !== undefined) {
			return { kind: 'word', entryId, word, on: row.pending.words[word] };
		}
		if (row.pending.memo !== undefined && row.memoReady) {
			return { kind: 'memo', entryId, memo: row.pending.memo };
		}
		return null;
	}

	async #drain(entryId: string): Promise<void> {
		const row = this.rows[entryId];
		if (!row || row.inflight) return;
		row.failed = false;
		row.inflight = true;
		try {
			for (;;) {
				const op = this.#next(entryId, row);
				if (!op) break;
				let value: InsightValue;
				try {
					value = await this.#send(op, { keepalive: row.keepalive });
				} catch {
					// 操作は消さない。端末に残してあるので、再読み込みしても戻せる。
					row.failed = true;
					return;
				}
				row.words = value.words;
				row.memo = value.memo;
				// サーバーの答えが正。上限で付かなかった言葉のように確定値と合わなくても、同じ操作を送り直さない
				// （送り直すと無限に繰り返す）。応答待ちの間に押し直した・書き足した分は値が違うので残る。
				if (op.kind === 'word' && row.pending.words[op.word] === op.on) {
					delete row.pending.words[op.word];
				}
				if (op.kind === 'memo' && row.pending.memo === op.memo) delete row.pending.memo;
				this.#prune(row);
				this.#persist();
			}
			row.saved = true;
			this.#persist();
		} finally {
			row.inflight = false;
		}
	}

	// ---- 端末に残す -------------------------------------------------------

	#persist() {
		try {
			const out: Record<string, InsightPending> = {};
			for (const [id, row] of Object.entries(this.rows)) {
				if (!hasPending(row.pending)) continue;
				out[id] = {
					words: { ...row.pending.words },
					...(row.pending.memo !== undefined ? { memo: row.pending.memo } : {})
				};
			}
			if (Object.keys(out).length === 0) localStorage.removeItem(this.#storageKey);
			else localStorage.setItem(this.#storageKey, JSON.stringify(out));
		} catch {
			// 端末に残せなくても、入力と送信は続けられる。
		}
	}

	#restore() {
		let parsed: unknown;
		try {
			const raw = localStorage.getItem(this.#storageKey);
			if (!raw) return;
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		if (!parsed || typeof parsed !== 'object') return;
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (!value || typeof value !== 'object') continue;
			const v = value as { words?: unknown; memo?: unknown };
			const pending: InsightPending = { words: {} };
			if (v.words && typeof v.words === 'object') {
				for (const [word, on] of Object.entries(v.words)) {
					if (typeof on === 'boolean') pending.words[word] = on;
				}
			}
			if (typeof v.memo === 'string') pending.memo = v.memo;
			const row = this.#ensure(id);
			row.pending = pending;
			if (pending.memo !== undefined) row.typed = pending.memo;
			this.#prune(row);
			if (hasPending(row.pending)) row.failed = true;
		}
		this.#persist();
	}
}
