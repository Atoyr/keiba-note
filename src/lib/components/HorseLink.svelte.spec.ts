import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import HorseLink from './HorseLink.svelte';

// Popover の中身は body の直下へ出る（Portal）ので、render の screen ではなく page で探す。
const dialog = () => page.getByRole('dialog');

const empty = { sire: null, dam: null, damSire: null, trainer: null, trainingCenter: null };
const full = {
	sire: 'チチウマ',
	dam: 'ハハウマ',
	damSire: 'ハハチチウマ',
	trainer: '調教師A',
	trainingCenter: '栗東'
} as const;

/** 枠の中の札を段ごとに、ラベルと値の組で並べる。 */
const rows = () =>
	[...document.querySelectorAll('[role="dialog"] dl')].map((dl) =>
		[...dl.querySelectorAll(':scope > div')].map((el) =>
			[...el.querySelectorAll('dt, dd')].map((e) => e.textContent?.trim())
		)
	);

describe('HorseLink', () => {
	it('基本情報が全部 null ならただのリンクで、押しても何も開かない', async () => {
		const screen = render(HorseLink, { horseId: 'h1', name: 'テスト馬', profile: empty });
		const link = screen.getByRole('link', { name: 'テスト馬' });

		await expect.element(link).toHaveAttribute('href', '/horses/h1');
		expect(screen.getByRole('button').elements()).toHaveLength(0);
		// クリックでリンクの遷移が起きないよう、a の既定動作は止めておく。
		link.element().addEventListener('click', (e) => e.preventDefault());
		await link.click();

		expect(dialog().elements()).toHaveLength(0);
	});

	it('基本情報があれば名前は button で、押すと父・母・母父・所属・調教師と馬の画面へのリンクが開き、Esc で閉じる', async () => {
		const screen = render(HorseLink, { horseId: 'h1', name: 'テスト馬', profile: full });

		const trigger = screen.getByRole('button', { name: 'テスト馬' });
		await expect.element(trigger).toBeInTheDocument();
		await expect.element(screen.getByRole('link')).not.toBeInTheDocument();
		expect(dialog().elements()).toHaveLength(0);

		// マウスの hover が無くても、押せば開く。
		await trigger.click();

		await expect.element(dialog()).toBeVisible();
		await expect.element(page.getByRole('dialog', { name: 'テスト馬の基本情報' })).toBeVisible();
		expect(rows()).toEqual([
			[['父', 'チチウマ']],
			[
				['母', 'ハハウマ'],
				['母父', 'ハハチチウマ']
			],
			[
				['所属', '栗東'],
				['調教師', '調教師A']
			]
		]);
		await expect
			.element(dialog().getByRole('link', { name: '馬の画面へ' }))
			.toHaveAttribute('href', '/horses/h1');

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
	});

	it('一部だけ（父だけ）なら、無い項目の札と空の段を出さない', async () => {
		const screen = render(HorseLink, {
			horseId: 'h1',
			name: 'テスト馬',
			profile: { ...empty, sire: 'チチウマ' }
		});

		await screen.getByRole('button', { name: 'テスト馬' }).click();

		await expect.element(dialog()).toBeVisible();
		expect(rows()).toEqual([[['父', 'チチウマ']]]);
	});

	it('調教師だけ（所属なし）でも開く', async () => {
		const screen = render(HorseLink, {
			horseId: 'h1',
			name: 'テスト馬',
			profile: { ...empty, trainer: '調教師A' }
		});

		await screen.getByRole('button', { name: 'テスト馬' }).click();

		await expect.element(dialog()).toBeVisible();
		expect(rows()).toEqual([[['調教師', '調教師A']]]);
	});

	it('hover しても何も出ない', async () => {
		const screen = render(HorseLink, { horseId: 'h1', name: 'テスト馬', profile: full });

		await screen.getByRole('button', { name: 'テスト馬' }).hover();
		await new Promise((r) => setTimeout(r, 600));

		expect(page.getByRole('tooltip').elements()).toHaveLength(0);
		expect(dialog().elements()).toHaveLength(0);
	});
});
