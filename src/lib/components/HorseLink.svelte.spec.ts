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

	it('特徴メモだけの馬（基本情報なし）でも名前は button で、押すと本文と馬の画面へのリンクが開き、Esc で閉じて名前へ戻る', async () => {
		const screen = render(HorseLink, {
			horseId: 'h1',
			name: 'テスト馬',
			profile: empty,
			trait: '東京の長い直線向き。\n右回りは割引。'
		});

		const trigger = screen.getByRole('button', { name: 'テスト馬' });
		await expect.element(trigger).toBeInTheDocument();
		await trigger.click();

		const box = page.getByRole('dialog', { name: 'テスト馬の特徴メモ' });
		await expect.element(box).toBeVisible();
		await expect.element(box).toHaveTextContent('東京の長い直線向き。');
		await expect.element(box).toHaveTextContent('右回りは割引。');
		expect(rows()).toEqual([]);
		await expect
			.element(dialog().getByRole('link', { name: '馬の画面へ' }))
			.toHaveAttribute('href', '/horses/h1');

		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
		await expect.element(trigger).toHaveFocus();
	});

	it('特徴メモも基本情報もあれば、メモ → 札の順で、名前は「特徴メモと基本情報」', async () => {
		const screen = render(HorseLink, {
			horseId: 'h1',
			name: 'テスト馬',
			profile: full,
			trait: '外に張る。'
		});

		await screen.getByRole('button', { name: 'テスト馬' }).click();

		const box = page.getByRole('dialog', { name: 'テスト馬の特徴メモと基本情報' });
		await expect.element(box).toBeVisible();
		const text = box.element().textContent ?? '';
		expect(text.indexOf('外に張る。')).toBeGreaterThan(-1);
		expect(text.indexOf('外に張る。')).toBeLessThan(text.indexOf('チチウマ'));
		expect(rows()).toHaveLength(3);
	});

	it('特徴メモが空白だけ・null で基本情報も無ければ、ただのリンクでアイコンも出ない', async () => {
		const screen = render(HorseLink, {
			horseId: 'h1',
			name: 'テスト馬',
			profile: empty,
			trait: '  \n '
		});

		const link = screen.getByRole('link', { name: 'テスト馬' });
		await expect.element(link).toHaveAttribute('href', '/horses/h1');
		expect(screen.getByRole('button').elements()).toHaveLength(0);
		expect(link.element().querySelector('svg')).toBeNull();
	});

	it('アイコンは特徴メモがあるときだけ、馬名の右に出て、読み上げ名を変えない', async () => {
		const withTrait = render(HorseLink, {
			horseId: 'h1',
			name: 'テスト馬',
			profile: full,
			trait: 'メモ'
		});
		// 読み上げの名前は「{馬名}（特徴メモあり）」。アイコン自体は aria-hidden。
		const button = withTrait
			.getByRole('button', { name: /^テスト馬\s*（特徴メモあり）$/ })
			.element();
		const icon = button.querySelector('svg');
		expect(icon).not.toBeNull();
		expect(icon?.getAttribute('aria-hidden')).toBe('true');
		withTrait.unmount();

		const without = render(HorseLink, { horseId: 'h1', name: 'テスト馬', profile: full });
		const plain = without.getByRole('button', { name: 'テスト馬', exact: true }).element();
		expect(plain.querySelector('svg')).toBeNull();
		expect(plain.textContent).not.toContain('特徴メモあり');
	});
});
