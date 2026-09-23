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
 * **2段で当てる**（ルートレイアウトの onMount）。
 * 1. `resetEarlyInput` — 触った欄を SSR の値に揃える。`DraftKeeper` はこのあと DOM から
 *    「保存済みの値」を読むので、書いた値がそこに紛れ込まないようにする。
 *    `bind:value` の欄（予想画面の `Textarea`）は hydration で書いた値が保たれるので、
 *    揃えないと書いた値が保存済みに数えられ、未保存の表示も離脱の確認も出なくなる
 * 2. `replayEarlyInput` — `DraftKeeper` が読んだあとに書いた値を当て、イベントを投げる
 *
 * **各フォームを `bind:value` にする案は採らなかった。** 札と印（チェックボックスとラジオ）は
 * `checked={値}` なので `bind:group` まで書き換えることになり、フォームを足すたびに同じ穴を
 * 開け直す。ここなら非制御のフォーム全部に効く。
 */

/**
 * 触った入力欄と、そのときの値。`initial` は最初に触る前の値（SSR の値）。
 * `src/app.html` の記録と同じ形。
 */
export type EarlyInput =
	| { el: Node; value: string; initial: string }
	| { el: Node; checked: boolean; initial: boolean }
	| { el: Node; selected: string[]; initial: string[] };

/** 入力欄の状態。記録の値と SSR の値のどちらを当てるときも使う。 */
type State = { value: string } | { checked: boolean } | { selected: string[] };

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

/** 状態を書く。もう同じなら false（`bind:value` の欄は hydration で保たれている）。 */
function apply(el: Field, s: State): boolean {
	if ('selected' in s) {
		if (!(el instanceof HTMLSelectElement)) return false;
		let changed = false;
		for (const o of el.options) {
			const on = s.selected.includes(o.value);
			if (o.selected !== on) {
				o.selected = on;
				changed = true;
			}
		}
		return changed;
	}
	if ('checked' in s) {
		if (!(el instanceof HTMLInputElement) || el.checked === s.checked) return false;
		el.checked = s.checked;
		return true;
	}
	if (el instanceof HTMLSelectElement || el.value === s.value) return false;
	el.value = s.value;
	return true;
}

const initialState = (r: EarlyInput): State =>
	'value' in r
		? { value: r.initial }
		: 'checked' in r
			? { checked: r.initial }
			: { selected: r.initial };

/**
 * 触った欄を SSR の値に揃える。イベントは投げない（画面側に知らせるのは書き戻すときだけ）。
 *
 * ラジオは同じ name の組ごと SSR の状態（`defaultChecked`）に戻す。触っていない ◎ が
 * 選択を外されたままだと、組として SSR の状態にならない。`defaultChecked` は Svelte が
 * アイドル時に属性を外すまで SSR の値のままで、onMount はそれより前に走る。
 */
export function resetEarlyInput(
	records: readonly EarlyInput[],
	root: Document | HTMLElement = document
) {
	for (const r of records) {
		const el = locate(r.el, root);
		if (!el) continue;
		if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
			for (const c of root.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
				if (c instanceof HTMLInputElement && c.form === el.form) c.checked = c.defaultChecked;
			continue;
		}
		apply(el, initialState(r));
	}
}

/**
 * 記録を触った順に書き戻し、書いた欄に `input`（札・印・選択肢は `change` も）を投げる。
 * `resetEarlyInput` のあと、`DraftKeeper` が保存済みの値を読んでから呼ぶ。
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
