import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import JockeyLink from './JockeyLink.svelte';

// Popover の中身は body の直下へ出る（Portal）ので、render の screen ではなく page で探す。
const dialog = () => page.getByRole('dialog');
// まとめの有無を示すアイコン（lucide の notebook-pen）。
const noteIcon = (el: Element) => el.querySelector('svg.lucide-notebook-pen');

describe('JockeyLink', () => {
	it('まとめが無ければただのリンクで、アイコンも無く、押しても何も開かない', async () => {
		const screen = render(JockeyLink, { name: 'ヤマダ/タロウ', summary: null });
		const link = screen.getByRole('link', { name: 'ヤマダ/タロウ' });

		// 騎手名は URL の中でエンコードして渡す。
		await expect
			.element(link)
			.toHaveAttribute('href', `/jockeys/${encodeURIComponent('ヤマダ/タロウ')}`);
		expect(link.element().querySelector('svg')).toBeNull();
		// クリックでリンクの遷移が起きないよう、a の既定動作は止めておく。
		link.element().addEventListener('click', (e) => e.preventDefault());
		await link.click();

		expect(dialog().elements()).toHaveLength(0);
	});

	it('まとめがあれば名前は button で、押すと本文と札と騎手の画面へのリンクが開き、Esc で閉じる', async () => {
		const screen = render(JockeyLink, {
			name: 'ヤマダ/タロウ',
			summary: { body: '中山の内回りは前に行く。', tags: ['穴で怖い', '中山巧者'] }
		});

		const trigger = screen.getByRole('button', { name: 'ヤマダ/タロウ' });
		await expect.element(trigger).toBeInTheDocument();
		await expect.element(screen.getByRole('link')).not.toBeInTheDocument();
		// 騎手名の右にアイコン。読み上げからは外し、名前は騎手名のまま。
		expect(noteIcon(trigger.element())?.getAttribute('aria-hidden')).toBe('true');
		expect(dialog().elements()).toHaveLength(0);

		// マウスの hover が無くても、押せば開く。
		await trigger.click();

		await expect.element(dialog()).toBeVisible();
		await expect.element(dialog()).toHaveTextContent('中山の内回りは前に行く。');
		await expect.element(dialog()).toHaveTextContent('中山巧者');
		await expect.element(dialog()).toHaveTextContent('穴で怖い');
		await expect
			.element(dialog().getByRole('link', { name: '騎手の画面へ' }))
			.toHaveAttribute('href', `/jockeys/${encodeURIComponent('ヤマダ/タロウ')}`);

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
	});

	it('本文が長くても切らずに全文を入れる', async () => {
		const long = Array.from({ length: 30 }, (_, i) => `${i + 1}行目の本文。`).join('\n');
		const screen = render(JockeyLink, { name: 'ヤマダ', summary: { body: long, tags: [] } });

		await screen.getByRole('button', { name: 'ヤマダ' }).click();

		await expect.element(dialog()).toBeVisible();
		const p = document.querySelector('[role="dialog"] p');
		expect(p?.textContent).toBe(long);
		expect(p?.className).not.toContain('line-clamp');
	});

	it('hover しても何も出ない', async () => {
		const screen = render(JockeyLink, {
			name: 'ヤマダ',
			summary: { body: '外差しも決める。', tags: [] }
		});

		await screen.getByRole('button', { name: 'ヤマダ' }).hover();
		await new Promise((r) => setTimeout(r, 600));

		expect(page.getByRole('tooltip').elements()).toHaveLength(0);
		expect(dialog().elements()).toHaveLength(0);
	});

	it('本文が空で札だけのまとめは、札だけ出す', async () => {
		const screen = render(JockeyLink, {
			name: 'ヤマダ',
			summary: { body: '', tags: ['芝巧者'] }
		});

		await screen.getByRole('button', { name: 'ヤマダ' }).click();

		await expect.element(dialog()).toHaveTextContent('芝巧者');
		// 本文の段落は作らない。
		expect(document.querySelector('[role="dialog"] p')).toBeNull();
	});

	it('本文も札も空のまとめは、無いのと同じでアイコンを出さずリンクのまま', async () => {
		const screen = render(JockeyLink, { name: 'ヤマダ', summary: { body: ' ', tags: [] } });

		const link = screen.getByRole('link', { name: 'ヤマダ' });
		await expect.element(link).toBeVisible();
		expect(link.element().querySelector('svg')).toBeNull();
		expect(screen.getByRole('button').elements()).toHaveLength(0);
	});
});
