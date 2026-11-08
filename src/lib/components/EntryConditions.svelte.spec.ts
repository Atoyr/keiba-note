import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EntryConditions from './EntryConditions.svelte';

describe('EntryConditions', () => {
	it('項目を並べ、変化の語だけ強めに出す', async () => {
		render(EntryConditions, {
			items: [
				{ lead: '乗り替わり', rest: '（前走 武豊）', strong: true },
				{ lead: '斤量', rest: ' 57kg（前走比 +1kg）', strong: false }
			]
		});
		const list = page.getByRole('list', { name: '今回の条件' });
		await expect.element(list).toHaveTextContent('乗り替わり（前走 武豊）');
		await expect.element(list).toHaveTextContent('斤量 57kg（前走比 +1kg）');
		await expect.element(page.getByText('乗り替わり', { exact: true })).toHaveClass(/font-medium/);
		await expect.element(page.getByText('斤量', { exact: true })).not.toHaveClass(/font-medium/);
	});

	it('390px の幅でもはみ出さず折り返す', async () => {
		const { container } = render(EntryConditions, {
			items: [
				{ lead: '乗り替わり', rest: '（前走 とても長い名前の騎手）', strong: true },
				{ lead: '騎手変更', rest: '（発表時 とても長い名前の騎手）', strong: true },
				{ lead: 'ブリンカー', rest: ' 外す（前走は着用）', strong: false }
			],
			class: 'w-[200px]'
		});
		const ul = container.querySelector('ul')!;
		expect(ul.scrollWidth).toBeLessThanOrEqual(ul.clientWidth);
	});
});
