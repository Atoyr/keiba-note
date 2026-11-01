import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	InsightSaver,
	MEMO_DEBOUNCE_MS,
	type InsightOp,
	type InsightValue
} from './insight-saver.svelte';

const KEY = 'test:insight';

/** 送る処理の代わり。呼ばれた順に溜め、テストが 1 つずつ応答する。 */
function fakeSend() {
	const calls: {
		op: InsightOp;
		keepalive: boolean;
		ok: (v: InsightValue) => void;
		ng: () => void;
	}[] = [];
	const send = (op: InsightOp, opts: { keepalive: boolean }) =>
		new Promise<InsightValue>((ok, reject) => {
			calls.push({ op, keepalive: opts.keepalive, ok, ng: () => reject(new Error('net')) });
		});
	return { calls, send };
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

function make(initial: Record<string, InsightValue> = {}) {
	const f = fakeSend();
	const saver = new InsightSaver({ storageKey: KEY, initial, send: f.send });
	return { saver, ...f };
}

beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('InsightSaver 言葉', () => {
	it('押すとすぐ押された状態になるが、応答までは未保存（破線）で、応答で確定する', async () => {
		const { saver, calls } = make();
		saver.toggle('e1', '前が壁');

		expect(calls).toHaveLength(1);
		expect(calls[0].op).toEqual({ kind: 'word', entryId: 'e1', word: '前が壁', on: true });
		expect(saver.words('e1', ['前が壁', '内詰まり'])).toEqual([
			{ word: '前が壁', pressed: true, unsaved: true },
			{ word: '内詰まり', pressed: false, unsaved: false }
		]);
		expect(saver.status('e1')).toBe('saving');

		calls[0].ok({ words: ['前が壁'], memo: '' });
		await flush();

		expect(saver.words('e1', ['前が壁'])).toEqual([
			{ word: '前が壁', pressed: true, unsaved: false }
		]);
		expect(saver.status('e1')).toBe('saved');
		// 送り切ったら端末の控えは消える。
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('もう一度押すと外す操作を送る', async () => {
		const { saver, calls } = make({ e1: { words: ['前が壁'], memo: '' } });
		saver.toggle('e1', '前が壁');
		expect(calls[0].op).toMatchObject({ on: false });
		calls[0].ok({ words: [], memo: '' });
		await flush();
		expect(saver.words('e1', ['前が壁'])[0].pressed).toBe(false);
	});

	it('馬ごとに直列。応答待ちの間の操作は応答のあとに 1 つずつ送る', async () => {
		const { saver, calls } = make();
		saver.toggle('e1', 'A');
		saver.toggle('e1', 'B');
		expect(calls).toHaveLength(1);

		calls[0].ok({ words: ['A'], memo: '' });
		await flush();
		expect(calls).toHaveLength(2);
		expect(calls[1].op).toMatchObject({ word: 'B', on: true });

		// 別の馬は待たずに送る。
		saver.toggle('e2', 'C');
		expect(calls).toHaveLength(3);
	});

	it('応答待ちの間の押し直しは未送信の操作を上書きし、送る前に確定値と同じなら捨てる', async () => {
		const { saver, calls } = make();
		saver.toggle('e1', 'A'); // 送信中: A を付ける
		saver.toggle('e1', 'A'); // 押し直し: 外したい
		expect(saver.words('e1', ['A'])[0].pressed).toBe(false);

		calls[0].ok({ words: ['A'], memo: '' });
		await flush();
		// 付いてしまったので、外す操作が続けて送られる。
		expect(calls).toHaveLength(2);
		expect(calls[1].op).toMatchObject({ word: 'A', on: false });
		calls[1].ok({ words: [], memo: '' });
		await flush();
		expect(saver.words('e1', ['A'])[0]).toEqual({ word: 'A', pressed: false, unsaved: false });

		// 送る前に 2 回押して元に戻った操作は送らない（送信中の馬を作って待たせる）。
		saver.toggle('e1', 'X');
		saver.toggle('e1', 'B');
		saver.toggle('e1', 'B');
		calls[2].ok({ words: ['X'], memo: '' });
		await flush();
		expect(calls).toHaveLength(3);
	});

	it('サーバーが付けなかった言葉（上限）を送り直さず、応答の値に合わせる', async () => {
		const { saver, calls } = make();
		saver.toggle('e1', '前が壁');
		calls[0].ok({ words: [], memo: '' });
		await flush();

		expect(calls).toHaveLength(1);
		expect(saver.words('e1', ['前が壁'])[0]).toEqual({
			word: '前が壁',
			pressed: false,
			unsaved: false
		});
		expect(saver.status('e1')).toBe('saved');
	});

	it('登録に無い付いた言葉は登録の後ろに並べ、外せる', () => {
		const { saver } = make({ e1: { words: ['消した言葉', '内詰まり'], memo: '' } });
		expect(saver.words('e1', ['内詰まり', '前残り'])).toEqual([
			{ word: '内詰まり', pressed: true, unsaved: false },
			{ word: '前残り', pressed: false, unsaved: false },
			{ word: '消した言葉', pressed: true, unsaved: false }
		]);
	});
});

describe('InsightSaver メモ', () => {
	it('打ち止めて 600ms で 1 回だけ送る', async () => {
		const { saver, calls } = make();
		saver.setMemo('e1', '前');
		saver.setMemo('e1', '前が壁');
		vi.advanceTimersByTime(MEMO_DEBOUNCE_MS - 1);
		expect(calls).toHaveLength(0);
		vi.advanceTimersByTime(1);

		expect(calls).toHaveLength(1);
		expect(calls[0].op).toEqual({ kind: 'memo', entryId: 'e1', memo: '前が壁' });
		expect(saver.memoUnsaved('e1')).toBe(true);
		expect(saver.status('e1')).toBe('saving');
		calls[0].ok({ words: [], memo: '前が壁' });
		await flush();
		expect(saver.memoUnsaved('e1')).toBe(false);
		expect(saver.status('e1')).toBe('saved');
	});

	it('欄を離れたら待たずに送る。打ちかけの末尾の空白は欄から消さない', async () => {
		const { saver, calls } = make();
		saver.setMemo('e1', '前が壁 ');
		saver.flushMemo('e1');
		expect(calls).toHaveLength(1);
		calls[0].ok({ words: [], memo: '前が壁' });
		await flush();
		expect(saver.memo('e1')).toBe('前が壁 ');
	});

	it('送信中に打ち足した分は、応答のあと打ち止めを待って送る', async () => {
		const { saver, calls } = make();
		saver.setMemo('e1', 'あ');
		saver.flushMemo('e1');
		saver.setMemo('e1', 'あい');
		calls[0].ok({ words: [], memo: 'あ' });
		await flush();
		expect(calls).toHaveLength(1);
		vi.advanceTimersByTime(MEMO_DEBOUNCE_MS);
		expect(calls[1].op).toMatchObject({ kind: 'memo', memo: 'あい' });
	});

	it('flushAll は打ち止めを待たずに送り、keepalive を渡す', () => {
		const { saver, calls } = make();
		saver.setMemo('e1', '前が壁');
		saver.flushAll({ keepalive: true });
		expect(calls).toHaveLength(1);
		expect(calls[0].keepalive).toBe(true);
	});
});

describe('InsightSaver 失敗と復元', () => {
	it('失敗しても操作は残り、端末に控えを置き、retry で送り直せる', async () => {
		const { saver, calls } = make();
		saver.toggle('e1', 'A');
		calls[0].ng();
		await flush();

		expect(saver.status('e1')).toBe('failed');
		expect(saver.words('e1', ['A'])[0]).toEqual({ word: 'A', pressed: true, unsaved: true });
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ e1: { words: { A: true } } });

		saver.retry('e1');
		expect(calls).toHaveLength(2);
		expect(saver.status('e1')).toBe('saving');
		calls[1].ok({ words: ['A'], memo: '' });
		await flush();
		expect(saver.status('e1')).toBe('saved');
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('retryFailed は失敗している馬だけを送り直す', async () => {
		const { saver, calls } = make();
		saver.toggle('e1', 'A');
		saver.toggle('e2', 'B');
		calls[0].ng();
		calls[1].ok({ words: ['B'], memo: '' });
		await flush();

		saver.retryFailed();
		expect(calls).toHaveLength(3);
		expect(calls[2].op).toMatchObject({ entryId: 'e1' });
	});

	it('restore は端末の控えを失敗として戻すが、自動では送らない', () => {
		localStorage.setItem(KEY, JSON.stringify({ e1: { words: { A: true }, memo: '前が壁' } }));
		const { saver, calls } = make();
		saver.restore();

		expect(calls).toHaveLength(0);
		expect(saver.status('e1')).toBe('failed');
		expect(saver.memo('e1')).toBe('前が壁');
		expect(saver.words('e1', ['A'])[0]).toEqual({ word: 'A', pressed: true, unsaved: true });
	});

	it('restore は、サーバーの値とすでに同じ控えと壊れた控えを捨てる', () => {
		localStorage.setItem(KEY, JSON.stringify({ e1: { words: { A: true } }, e2: 5 }));
		const { saver } = make({ e1: { words: ['A'], memo: '' } });
		saver.restore();
		expect(saver.status('e1')).toBe('idle');
		expect(localStorage.getItem(KEY)).toBeNull();

		localStorage.setItem(KEY, 'not json');
		saver.restore();
		expect(saver.status('e1')).toBe('idle');
	});

	it('localStorage が使えなくても動く', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('denied');
		});
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		const { saver, calls } = make();
		saver.restore();
		saver.toggle('e1', 'A');
		calls[0].ok({ words: ['A'], memo: '' });
		await flush();
		expect(saver.status('e1')).toBe('saved');
	});
});
