import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EntryMemo from './EntryMemo.svelte';
import '../../routes/layout.css';

it('kind の札・本文・札が出る。本文は3行までで切る', () => {
	const screen = render(EntryMemo, {
		kind: '出走前',
		body: '内枠が向きそう',
		tags: ['次走買い', '馬場一致']
	});
	const p = screen.container.querySelector('p')!;
	expect(p.textContent).toContain('出走前');
	expect(p.textContent).toContain('内枠が向きそう');
	expect(p.className).toContain('line-clamp-3');
	// 札は本文の下
	const text = screen.container.textContent ?? '';
	expect(text).toContain('次走買い');
	expect(text).toContain('馬場一致');
	expect(text.indexOf('内枠が向きそう')).toBeLessThan(text.indexOf('次走買い'));
});

it('kind が無ければ種別の札を出さない', () => {
	const screen = render(EntryMemo, { body: '本文だけ', tags: [] });
	const p = screen.container.querySelector('p')!;
	expect(p.textContent?.trim()).toBe('本文だけ');
	expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
});

it('札だけのメモは、段落が種別の札だけになる', () => {
	const screen = render(EntryMemo, { kind: 'ふりかえり', body: '', tags: ['次走消し'] });
	const p = screen.container.querySelector('p')!;
	expect(p.textContent?.trim()).toBe('ふりかえり');
	expect(screen.container.textContent).toContain('次走消し');
});

it('本文（空白だけを含む）も札も空なら何も出さない', () => {
	const screen = render(EntryMemo, { kind: '出走前', body: ' \n ', tags: [] });
	expect(screen.container.querySelector('p')).toBeNull();
	expect(screen.container.textContent?.trim()).toBe('');
});
