import '../../routes/layout.css';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
	// 戻るボタンは上の帯（ghost）と下に貼り付く帯の2つ。どちらも onclose を呼ぶ。
	const backs = screen.getByRole('button', { name: 'ふりかえりに戻る' });
	expect(backs.elements()).toHaveLength(2);
	await backs.first().click();
	expect(onclose).toHaveBeenCalledOnce();
});

it('下に貼り付く帯の「ふりかえりに戻る」でも onclose を呼ぶ', async () => {
	const { screen, onclose } = setup();
	await screen.getByRole('button', { name: 'ふりかえりに戻る' }).last().click();
	expect(onclose).toHaveBeenCalledOnce();
});

it('帯の文は 失敗 > 保存中 > 保存しました > 案内 の順で、成功の前に「保存しました」を出さない', async () => {
	const { screen } = setup();
	const band = screen.getByRole('status');
	await expect.element(band).toHaveTextContent('言葉を選ぶと自動で保存します');
	await expect.element(band).not.toHaveTextContent('保存しました');
	screen.unmount();

	const saving = setup(['前が壁'], { status: { e1: 'saving' }, busy: true });
	await expect.element(saving.screen.getByRole('status')).toHaveTextContent('保存中…');
	await expect.element(saving.screen.getByRole('status')).not.toHaveTextContent('保存しました');
	saving.screen.unmount();

	const saved = setup(['前が壁'], { status: { e1: 'saved' } });
	await expect.element(saved.screen.getByRole('status')).toHaveTextContent('保存しました');
	saved.screen.unmount();

	// 失敗があれば、ほかが保存済みでも失敗を先に出す。
	const failed = setup(['前が壁'], { status: { e1: 'saved', e2: 'error' }, failed: 1 });
	await expect
		.element(failed.screen.getByRole('status'))
		.toHaveTextContent('1頭を保存できませんでした');
});

it('失敗があれば「もう一度保存」を出し、押すと onretry（馬は指定しない）を呼ぶ。失敗が無ければ出さない', async () => {
	const onretry = vi.fn();
	const { screen } = setup(['前が壁'], { status: { e2: 'error' }, failed: 1, onretry });
	await screen.getByRole('button', { name: 'もう一度保存' }).click();
	expect(onretry).toHaveBeenCalledWith();
	screen.unmount();

	const none = setup();
	expect(none.screen.getByRole('button', { name: 'もう一度保存' }).elements()).toHaveLength(0);
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

const ORDER_KEY = 'uma-memo:quick-review-order';
beforeEach(() => localStorage.removeItem(ORDER_KEY));
afterEach(() => localStorage.removeItem(ORDER_KEY));

// 着順の順（1着=3番、2着=1番、3着=2番）と馬番の順が違う。
const mixed: ComponentProps<typeof QuickReview>['rows'] = [
	{ entryId: 'a', horseName: '三番馬', bracket: 3, horseNumber: 3, finishPosition: 1, mark: '◎' },
	{ entryId: 'b', horseName: '一番馬', bracket: 1, horseNumber: 1, finishPosition: 2, mark: null },
	{ entryId: 'c', horseName: '二番馬', bracket: 2, horseNumber: 2, finishPosition: 3, mark: null }
];
function setupMixed(rowsArg = mixed) {
	return render(QuickReview, {
		rows: rowsArg,
		bodies: {},
		registered: ['前が壁'],
		onchange: vi.fn(),
		onclose: vi.fn()
	});
}
const ids = (screen: ReturnType<typeof render>) =>
	screen
		.getByRole('listitem')
		.elements()
		.map((el) => el.id);

it('着順のある一覧に並び順を出し、「馬番」を押すと馬番順になる', async () => {
	const screen = setupMixed();
	const group = screen.getByRole('group', { name: '並び順' });
	await expect
		.element(group.getByRole('button', { name: '着順' }))
		.toHaveAttribute('aria-pressed', 'true');
	expect(ids(screen)).toEqual(['quick-a', 'quick-b', 'quick-c']);

	await group.getByRole('button', { name: '馬番' }).click();
	await expect
		.element(group.getByRole('button', { name: '馬番' }))
		.toHaveAttribute('aria-pressed', 'true');
	await expect
		.element(group.getByRole('button', { name: '着順' }))
		.toHaveAttribute('aria-pressed', 'false');
	expect(ids(screen)).toEqual(['quick-b', 'quick-c', 'quick-a']);
});

it('着順がだれにも無い一覧には並び順を出さない', async () => {
	const screen = setupMixed(mixed.map((r) => ({ ...r, finishPosition: null })));
	expect(screen.getByRole('group', { name: '並び順' }).elements()).toHaveLength(0);
});

it('「馬番」の選びは localStorage に残り、描き直すと馬番順から始まる。着順に戻すと消える', async () => {
	const first = setupMixed();
	await first.getByRole('button', { name: '馬番' }).click();
	expect(localStorage.getItem(ORDER_KEY)).toBe('1');
	first.unmount();

	const second = setupMixed();
	await expect
		.element(second.getByRole('button', { name: '馬番' }))
		.toHaveAttribute('aria-pressed', 'true');
	expect(ids(second)).toEqual(['quick-b', 'quick-c', 'quick-a']);
	await second.getByRole('button', { name: '着順' }).click();
	expect(localStorage.getItem(ORDER_KEY)).toBeNull();
});

it('印のある一覧では行の名前に「印◎」が入り、印がだれにも無ければ「印」は出ない', async () => {
	const screen = setupMixed();
	await expect
		.element(screen.getByRole('button', { name: /三番馬\s*のクイック入力.*印\s*◎/ }))
		.toBeVisible();
	screen.unmount();

	const none = setupMixed(mixed.map((r) => ({ ...r, mark: null })));
	expect(none.getByText('印', { exact: true }).elements()).toHaveLength(0);
});

it('言葉が0個のときは帯の状態の文を出さず、「ふりかえりに戻る」を outline にする', async () => {
	const { screen, onclose } = setup([]);
	expect(screen.getByRole('status').elements()).toHaveLength(0);
	const back = screen.getByRole('button', { name: 'ふりかえりに戻る' }).last();
	// 塗り（bg-primary）にしない。
	expect(back.element().className).not.toContain('bg-primary');
	await back.click();
	expect(onclose).toHaveBeenCalledOnce();
});

it('ログイン切れのときは帯の文を差し替え、「もう一度保存」の代わりに「ログインし直す」を出す', async () => {
	const { screen } = setup(['前が壁'], {
		status: { e1: 'error' },
		failed: 1,
		authExpired: true,
		loginHref: '/login?redirect=%2Fraces%2Fx'
	});
	await expect
		.element(screen.getByRole('status'))
		.toHaveTextContent('ログインが切れたため保存できませんでした。');
	await expect
		.element(screen.getByRole('link', { name: 'ログインし直す' }))
		.toHaveAttribute('href', '/login?redirect=%2Fraces%2Fx');
	expect(screen.getByRole('button', { name: 'もう一度保存' }).elements()).toHaveLength(0);
});
