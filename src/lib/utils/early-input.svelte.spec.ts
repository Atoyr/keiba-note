import { afterEach, describe, expect, it } from 'vitest';
import { replayEarlyInput, resetEarlyInput, type EarlyInput } from './early-input';

/**
 * 実 chromium で DOM に書き戻す。記録は `src/app.html` が取るので、ここでは
 * 記録を手で組み、hydration が SSR の値に戻したあとの DOM に当てる。
 * app.html の記録から通しで見るのは e2e/hydration.e2e.ts。
 */
function mount(html: string) {
	const root = document.createElement('form');
	root.innerHTML = html;
	document.body.appendChild(root);
	return root;
}

/** 投げられたイベントを `name:type` で並べる。 */
function listen(root: HTMLElement) {
	const seen: string[] = [];
	for (const type of ['input', 'change'])
		root.addEventListener(type, (e) => seen.push(`${(e.target as HTMLInputElement).name}:${type}`));
	return seen;
}

afterEach(() => document.body.replaceChildren());

describe('replayEarlyInput', () => {
	it('本文を書き戻し、input を投げる', () => {
		const root = mount('<textarea name="body"></textarea>');
		const seen = listen(root);
		const el = root.querySelector('textarea')!;

		expect(replayEarlyInput([{ el, value: '書いた', initial: '' }], root)).toBe(1);
		expect(el.value).toBe('書いた');
		expect(seen).toEqual(['body:input']);
	});

	it('もう同じ値なら触らず、イベントも投げない（bind:value の欄は hydration で保たれる）', () => {
		const root = mount('<textarea name="body"></textarea>');
		const seen = listen(root);
		const el = root.querySelector('textarea')!;
		el.value = '書いた';

		expect(replayEarlyInput([{ el, value: '書いた', initial: '' }], root)).toBe(0);
		expect(seen).toEqual([]);
	});

	it('札の on / off を書き戻し、input と change を投げる', () => {
		const root = mount(
			'<input type="checkbox" name="tags" value="不利" checked><input type="checkbox" name="tags" value="好上がり">'
		);
		const seen = listen(root);
		const [off, on] = root.querySelectorAll('input');

		const records: EarlyInput[] = [
			{ el: off, checked: false, initial: true },
			{ el: on, checked: true, initial: false }
		];
		expect(replayEarlyInput(records, root)).toBe(2);
		expect([off.checked, on.checked]).toEqual([false, true]);
		expect(seen).toEqual(['tags:input', 'tags:change', 'tags:input', 'tags:change']);
	});

	it('ラジオは渡した順に当てるので、最後に選んだものが残る', () => {
		const root = mount(
			['◎', '▲', '△'].map((m) => `<input type="radio" name="mark" value="${m}">`).join('')
		);
		const [honmei, tanana, hoshi] = root.querySelectorAll('input');
		honmei.checked = true;

		replayEarlyInput(
			[
				{ el: tanana, checked: true, initial: false },
				{ el: hoshi, checked: true, initial: false }
			],
			root
		);
		expect([honmei.checked, tanana.checked, hoshi.checked]).toEqual([false, false, true]);
	});

	it('選択肢は選ばれていたものだけを選び直す', () => {
		const root = mount(
			'<select name="grade" multiple><option>G1</option><option>G2</option><option>G3</option></select>'
		);
		const el = root.querySelector('select')!;

		replayEarlyInput([{ el, selected: ['G1', 'G3'], initial: [] }], root);
		expect(Array.from(el.selectedOptions, (o) => o.value)).toEqual(['G1', 'G3']);
	});

	it('作り直されて外れた要素は、name（札・印は value も）で探して書く', () => {
		const stale = mount(
			'<textarea name="body"></textarea><input type="radio" name="mark" value="△">'
		);
		const [oldBody, oldMark] = stale.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
			'textarea, input'
		);
		stale.remove();

		const root = mount(
			'<textarea name="body"></textarea><input type="radio" name="mark" value="◎" checked><input type="radio" name="mark" value="△">'
		);
		expect(
			replayEarlyInput(
				[
					{ el: oldBody, value: '書いた', initial: '' },
					{ el: oldMark, checked: true, initial: false }
				],
				root
			)
		).toBe(2);
		expect(root.querySelector('textarea')!.value).toBe('書いた');
		expect(root.querySelector<HTMLInputElement>('input[value="△"]')!.checked).toBe(true);
	});

	it('name で1つに絞れなければ書かない（別の欄に書くよりは消えるほうがまし）', () => {
		const stale = mount('<textarea name="body"></textarea>');
		const old = stale.querySelector('textarea')!;
		stale.remove();

		const root = mount('<textarea name="body"></textarea><textarea name="body"></textarea>');
		expect(replayEarlyInput([{ el: old, value: '書いた', initial: '' }], root)).toBe(0);
		expect(Array.from(root.querySelectorAll('textarea'), (t) => t.value)).toEqual(['', '']);
	});
});

describe('resetEarlyInput', () => {
	it('触った欄を SSR の値に戻す（bind:value で書いた値が残った欄も）。イベントは投げない', () => {
		const root = mount(
			'<textarea name="body">保存済み</textarea><input type="checkbox" name="tags" value="不利">'
		);
		const seen = listen(root);
		const [body, tag] = root.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
			'textarea, input'
		);
		body.value = '書いた';
		(tag as HTMLInputElement).checked = true;

		resetEarlyInput(
			[
				{ el: body, value: '書いた', initial: '保存済み' },
				{ el: tag, checked: true, initial: false }
			],
			root
		);
		expect(body.value).toBe('保存済み');
		expect((tag as HTMLInputElement).checked).toBe(false);
		expect(seen).toEqual([]);
	});

	it('ラジオは組ごと SSR の選択に戻す（触っていない ◎ も選び直す）', () => {
		const root = mount(
			'<input type="radio" name="mark" value="◎" checked><input type="radio" name="mark" value="△">'
		);
		const [honmei, hoshi] = root.querySelectorAll('input');
		hoshi.checked = true;

		resetEarlyInput([{ el: hoshi, checked: true, initial: false }], root);
		expect([honmei.checked, hoshi.checked]).toEqual([true, false]);
	});
});
