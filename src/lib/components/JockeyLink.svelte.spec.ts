import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import JockeyLink from './JockeyLink.svelte';

// ツールチップの中身は body の直下へ出る（Portal）ので、render の screen ではなく page で探す。
const tooltip = () => page.getByRole('tooltip');

describe('JockeyLink', () => {
	it('まとめが無ければただのリンクで、hover しても何も出ない', async () => {
		const screen = render(JockeyLink, { name: 'ヤマダ/タロウ', summary: null });
		const link = screen.getByRole('link', { name: 'ヤマダ/タロウ' });

		// 騎手名は URL の中でエンコードして渡す。
		await expect
			.element(link)
			.toHaveAttribute('href', `/jockeys/${encodeURIComponent('ヤマダ/タロウ')}`);
		await link.hover();
		// ツールチップの遅延（300ms）より長く待っても出ない。
		await new Promise((r) => setTimeout(r, 600));

		await expect.element(tooltip()).not.toBeInTheDocument();
		expect(link.element().hasAttribute('aria-describedby')).toBe(false);
	});

	it('まとめがあれば hover で本文と札が出て、リンクはリンクのまま', async () => {
		const screen = render(JockeyLink, {
			name: 'ヤマダ',
			summary: { body: '中山の内回りは前に行く。', tags: ['穴で怖い', '中山巧者'] }
		});
		const link = screen.getByRole('link', { name: 'ヤマダ' });
		await expect.element(link).toHaveAttribute('href', `/jockeys/${encodeURIComponent('ヤマダ')}`);

		await link.hover();

		await expect.element(tooltip()).toBeVisible();
		await expect.element(tooltip()).toHaveTextContent('中山の内回りは前に行く。');
		// 札は JOCKEY_TAGS の順で出る。
		await expect.element(tooltip()).toHaveTextContent('中山巧者');
		await expect.element(tooltip()).toHaveTextContent('穴で怖い');
		// ボタンにはしない。開いている間は説明として結ばれる。
		expect(link.element().tagName).toBe('A');
		expect(link.element().getAttribute('type')).toBeNull();
		expect(link.element().getAttribute('aria-haspopup')).toBeNull();
		expect(link.element().getAttribute('aria-describedby')).toBeTruthy();
	});

	it('キーボードのフォーカスでも出て、Esc で閉じる', async () => {
		// 前のテストで乗せたマウスがリンクの位置に残っていると、hover で開いてしまう。外へ動かしておく。
		// リンクの前に置いた button にフォーカスしてから Tab を押す（何にも乗っていないと Tab がページの外へ出る）。
		const away = document.createElement('button');
		away.style.cssText = 'position:fixed;right:0;bottom:0;width:20px;height:20px';
		document.body.appendChild(away);
		await userEvent.hover(away);
		away.focus();

		const screen = render(JockeyLink, {
			name: 'ヤマダ',
			summary: { body: '外差しも決める。', tags: [] }
		});
		await expect.element(tooltip()).not.toBeInTheDocument();

		await userEvent.tab();
		await expect.element(screen.getByRole('link', { name: 'ヤマダ' })).toHaveFocus();
		await expect.element(tooltip()).toHaveTextContent('外差しも決める。');

		await userEvent.keyboard('{Escape}');
		await expect.element(tooltip()).not.toBeInTheDocument();
		away.remove();
	});

	it('本文が空で札だけのまとめは、札だけ出す', async () => {
		const screen = render(JockeyLink, {
			name: 'ヤマダ',
			summary: { body: '', tags: ['芝巧者'] }
		});

		await screen.getByRole('link', { name: 'ヤマダ' }).hover();

		await expect.element(tooltip()).toHaveTextContent('芝巧者');
		// 本文の段落は作らない。
		expect(document.querySelector('[role="tooltip"] p')).toBeNull();
	});
});
