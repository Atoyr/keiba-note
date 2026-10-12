import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import InfoTip from './InfoTip.svelte';

// Popover の中身は body の直下へ出る（Portal）ので、render の screen ではなく page で探す。
const dialog = () => page.getByRole('dialog');

describe('InfoTip', () => {
	it('ボタンの名前は「{label}の説明」で、最初は説明が出ていない', async () => {
		const screen = render(InfoTip, {
			label: '推しの出走予定',
			text: '推しにした馬の、登録済みのレース'
		});

		await expect
			.element(screen.getByRole('button', { name: '推しの出走予定の説明' }))
			.toBeInTheDocument();
		expect(dialog().elements()).toHaveLength(0);
	});

	it('クリック（タップ）で説明が開き、Esc で閉じる', async () => {
		const screen = render(InfoTip, {
			label: 'レースの見立て',
			text: '馬場の想定、狙いどころ。ふりかえりとは別に残ります'
		});

		await screen.getByRole('button', { name: 'レースの見立ての説明' }).click();

		await expect.element(dialog()).toBeVisible();
		await expect
			.element(dialog())
			.toHaveTextContent('馬場の想定、狙いどころ。ふりかえりとは別に残ります');

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
	});

	it('マウスの hover でも説明が開く', async () => {
		const screen = render(InfoTip, { label: 'ふりかえり待ち', text: '予想したレースの答え合わせ' });

		await screen.getByRole('button', { name: 'ふりかえり待ちの説明' }).hover();

		await expect.element(dialog()).toBeVisible();
		await expect.element(dialog()).toHaveTextContent('予想したレースの答え合わせ');
	});
});
