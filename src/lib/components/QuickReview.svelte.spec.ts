import '../../routes/layout.css';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import QuickReview from './QuickReview.svelte';
import { DEFAULT_INSIGHT_WORDS } from '$lib/utils/insight-words';

const rows = [
	{ entryId: 'e1', horseName: '一番馬', bracket: 1, horseNumber: 1, finishPosition: 1 },
	{ entryId: 'e2', horseName: '二番馬', bracket: 2, horseNumber: 2, finishPosition: 2 }
];

function setup(registered = ['前が壁'], extra: Record<string, unknown> = {}) {
	const onclose = vi.fn();
	const onchange = vi.fn();
	const screen = render(QuickReview, {
		rows,
		bodies: { e1: '', e2: '' },
		registered,
		onchange,
		onclose,
		...extra
	});
	return { screen, onclose, onchange };
}
const rowBtn = (screen: ReturnType<typeof render>, name: string) =>
	screen.getByRole('button', { name: new RegExp(`${name}\\s*のクイック入力`) });

it('馬を1頭1行で並べ、別の馬を開くと前の馬が閉じる', async () => {
	const { screen } = setup();
	const one = rowBtn(screen, '一番馬');
	const two = rowBtn(screen, '二番馬');
	await expect.element(one).toHaveAttribute('aria-expanded', 'false');
	await one.click();
	await expect.element(one).toHaveAttribute('aria-expanded', 'true');
	await two.click();
	await expect.element(two).toHaveAttribute('aria-expanded', 'true');
	await expect.element(one).toHaveAttribute('aria-expanded', 'false');
});

it('「ふりかえりに戻る」で onclose を呼ぶ。見出しがあり、説明と登録・編集のリンクを1回だけ出す', async () => {
	const { screen, onclose } = setup();
	await expect.element(screen.getByRole('heading', { name: 'クイック入力' })).toBeVisible();
	expect(screen.getByRole('link', { name: '言葉を登録・編集する' }).elements()).toHaveLength(1);
	await screen.getByRole('button', { name: 'ふりかえりに戻る' }).click();
	expect(onclose).toHaveBeenCalledOnce();
});

it('言葉が0個なら、案内とリンクを1回だけ、おすすめをまとめて登録するボタン（別のフォームに属す）と例を出す', async () => {
	const { screen } = setup([]);
	await expect
		.element(screen.getByText('よく使う言葉を登録すると、押すだけでメモに入れられます。'))
		.toBeVisible();
	expect(screen.getByRole('link', { name: '言葉を登録する' }).elements()).toHaveLength(1);
	const button = screen.getByRole('button', { name: 'おすすめの言葉をまとめて登録する' });
	await expect.element(button).toHaveAttribute('form', 'insight-defaults');
	await expect
		.element(
			screen.getByText(`上がりが強い・内詰まり・前が壁など${DEFAULT_INSIGHT_WORDS.length}個`)
		)
		.toBeVisible();
});

it('おすすめの登録中は「登録中…」と aria-disabled、失敗の文は alert で出す。言葉があれば出さない', async () => {
	const { screen } = setup([], { defaultsPending: true, defaultsError: '登録できませんでした' });
	await expect
		.element(screen.getByRole('button', { name: '登録中…' }))
		.toHaveAttribute('aria-disabled', 'true');
	await expect.element(screen.getByRole('alert')).toHaveTextContent('登録できませんでした');
	screen.unmount();

	const withWords = setup(['前が壁']).screen;
	expect(
		withWords.getByRole('button', { name: 'おすすめの言葉をまとめて登録する' }).elements()
	).toHaveLength(0);
});
