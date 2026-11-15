import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import HorseMemoRow from './HorseMemoRow.svelte';

const base = { horseId: 'h1', name: 'テスト馬', trait: null, matches: [] };

describe('HorseMemoRow', () => {
	it('メモも合う札も前回も無ければ、行ごと出さない', () => {
		const screen = render(HorseMemoRow, base);
		expect(screen.container.querySelector('[data-memo-row]')).toBeNull();
	});

	it('メモが空（空白の本文・札なし）でも、行を出さない', () => {
		const screen = render(HorseMemoRow, { ...base, trait: { body: '  ', tags: [] } });
		expect(screen.container.querySelector('[data-memo-row]')).toBeNull();
	});

	it('アイコンを押すと本文と全部の札と馬の画面へのリンクが開き、Esc でアイコンへ戻る', async () => {
		const screen = render(HorseMemoRow, {
			...base,
			trait: { body: '外に張る。\n右回りは割引。', tags: ['東京巧者', '右回り巧者'] },
			matches: ['東京巧者']
		});

		const icon = screen.getByRole('button', { name: 'テスト馬のメモ', exact: true });
		await expect.element(icon).toBeVisible();
		expect(icon.element().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
		await icon.click();

		const dialog = page.getByRole('dialog', { name: 'テスト馬のメモ' });
		await expect.element(dialog).toHaveTextContent('外に張る。');
		await expect.element(dialog).toHaveTextContent('右回りは割引。');
		await expect.element(dialog).toHaveTextContent('右回り巧者');
		await expect
			.element(dialog.getByRole('link', { name: '馬の画面へ' }))
			.toHaveAttribute('href', '/horses/h1');

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog).not.toBeInTheDocument();
		await expect.element(icon).toHaveFocus();
	});

	it('札だけのメモでもアイコンが出て、開くと本文の段は無い', async () => {
		const screen = render(HorseMemoRow, {
			...base,
			trait: { body: '', tags: ['マイル巧者'] }
		});
		await screen.getByRole('button', { name: 'テスト馬のメモ', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'テスト馬のメモ' });
		await expect.element(dialog).toHaveTextContent('マイル巧者');
		expect(dialog.element().querySelector('p[tabindex="0"]')).toBeNull();
	});

	it('合う札だけ（メモなし）なら、アイコンは出さず、合う札を読み上げの語つきで出す', async () => {
		const screen = render(HorseMemoRow, { ...base, matches: ['京都巧者', '中距離巧者'] });
		expect(screen.getByRole('button').elements()).toHaveLength(0);
		const row = screen.container.querySelector('[data-memo-row]')!;
		expect(row.textContent).toContain('このレースに合う札');
		expect(row.textContent).toContain('京都巧者');
		expect(row.textContent).toContain('中距離巧者');
	});

	it('前回の札だけでも出る（予想画面。title は付けた日）', () => {
		const screen = render(HorseMemoRow, {
			...base,
			conclusion: { occurredAt: '2026-04-26', tags: ['次走買い'] }
		});
		const el = screen.container.querySelector('[title="2026-04-26 に付けた札"]')!;
		expect(el.textContent).toContain('前回');
		expect(el.textContent).toContain('次走買い');
	});
});
