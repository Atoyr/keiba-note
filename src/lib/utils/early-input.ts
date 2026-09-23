/**
 * hydration の前に書かれた入力を書き戻す。
 *
 * **なぜ要るか。** Svelte 5 は hydration で、`<textarea>{値}</textarea>` や `checked={値}` の
 * 入力欄を `.value` / `.checked` の代入で SSR の値に合わせにいく。JS が届く前に打った文字や
 * 付けた札・印は、そこで SSR の値（多くは空）に戻る。ふりかえりと予想のフォームは
 * 「空欄＝そのメモを消す」ので、気づかず保存すると書いたつもりのものが残らない。
 * 電波の悪い競馬場では JS が遅れて届くので起きやすい。
 *
 * 記録は `src/app.html` のインラインスクリプトが取る（バンドルは hydration と一緒に
 * 届くので、それより前の入力はバンドルからは拾えない）。ここはそれを受け取って書き戻す。
 *
 * **各フォームを `bind:value` にする案は採らなかった。** Svelte の `bind:value` には
 * hydration 中の変更を保つ処理があるが、チェックボックスとラジオ（札・印）には無く、
 * フォームごとに直すと新しいフォームで同じ穴を開け直す。ここなら非制御のフォーム全部に効く。
 */

/** 触った入力欄と、そのときの値。`src/app.html` の記録と同じ形。 */
export type EarlyInput =
	{ el: Node; value: string } | { el: Node; checked: boolean } | { el: Node; selected: string[] };

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

declare global {
	interface Window {
		/** `src/app.html` が置く。`take` は記録を止めて、触った順に返す。 */
		__kNoteEarlyInput?: { take(): EarlyInput[] };
	}
}

/** 記録を止めて受け取る。2回目以降と、記録が無いときは空。 */
export function takeEarlyInput(): EarlyInput[] {
	const recorder = window.__kNoteEarlyInput;
	delete window.__kNoteEarlyInput;
	return recorder?.take() ?? [];
}

// 要素の型を `Element` / `ParentNode` にしないのは、Cloudflare の型（HTMLRewriter の Element）と
// 名前がぶつかり、HTMLSelectElement などが代入できなくなるため。
const isField = (el: unknown): el is Field =>
	el instanceof HTMLInputElement ||
	el instanceof HTMLTextAreaElement ||
	el instanceof HTMLSelectElement;

/**
 * 書き戻す先。ふつうは記録した要素そのもの（hydration は SSR の要素を使い回す）。
 *
 * SSR と食い違って Svelte が作り直した場合は、要素が DOM から外れている。そのときは
 * name（チェックボックスとラジオは value も）で1つに絞れたものに書く。絞れなければ諦める。
 * 別の欄に書くよりは、消えるほうがまし。
 */
function locate(el: Node, root: Document | HTMLElement): Field | null {
	if (!isField(el)) return null;
	if (el.isConnected) return el;
	if (!el.name) return null;

	const found: Field[] = [];
	for (const c of root.querySelectorAll(`[name="${CSS.escape(el.name)}"]`)) {
		if (!isField(c) || c.tagName !== el.tagName || c.type !== el.type) continue;
		// 札と印は同じ name が並ぶので、value まで見ないと1つに絞れない。
		if ((el.type === 'checkbox' || el.type === 'radio') && c.value !== el.value) continue;
		found.push(c);
	}
	return found.length === 1 ? found[0] : null;
}

/** 記録の値を書く。もう同じ値なら false（`bind:value` の欄は hydration で保たれている）。 */
function apply(el: Field, r: EarlyInput): boolean {
	if ('selected' in r) {
		if (!(el instanceof HTMLSelectElement)) return false;
		let changed = false;
		for (const o of el.options) {
			const on = r.selected.includes(o.value);
			if (o.selected !== on) {
				o.selected = on;
				changed = true;
			}
		}
		return changed;
	}
	if ('checked' in r) {
		if (!(el instanceof HTMLInputElement) || el.checked === r.checked) return false;
		el.checked = r.checked;
		return true;
	}
	if (el instanceof HTMLSelectElement || el.value === r.value) return false;
	el.value = r.value;
	return true;
}

/**
 * 記録を触った順に書き戻し、書いた欄に `input`（札・印・選択肢は `change` も）を投げる。
 *
 * イベントを投げるのは、書き戻した値を画面側に知らせるため。`DraftKeeper` はこれで
 * 「未保存の変更」に数え、`bind:` の付いた欄は状態を合わせる。
 *
 * @returns 書き戻した欄の数
 */
export function replayEarlyInput(
	records: readonly EarlyInput[],
	root: Document | HTMLElement = document
) {
	let count = 0;
	for (const r of records) {
		const el = locate(r.el, root);
		if (!el || !apply(el, r)) continue;
		el.dispatchEvent(new Event('input', { bubbles: true }));
		if (!('value' in r)) el.dispatchEvent(new Event('change', { bubbles: true }));
		count++;
	}
	return count;
}
