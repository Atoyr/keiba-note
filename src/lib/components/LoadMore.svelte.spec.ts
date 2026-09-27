import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LoadMore from './LoadMore.svelte';

const NEXT = '/races?year=&offset=100';

describe('LoadMore', () => {
	it('続きが無ければ何も出さない', async () => {
		const screen = render(LoadMore, { href: null, load: vi.fn(), shown: 3, unit: '件' });

		await expect.element(screen.getByRole('link')).not.toBeInTheDocument();
	});

	it('下端が見えていれば、押さなくても続きを読み、読めた数を読み上げで伝える', async () => {
		const props = { href: NEXT as string | null, load: vi.fn(), shown: 100, unit: '件' };
		const screen = render(LoadMore, props);
		// 読み終えたら続きが無くなったことにする（読むたびに href が替わるのが本来の流れ）。
		props.load.mockImplementation(async () => {
			await screen.rerender({ href: null, shown: 150 });
		});

		await vi.waitFor(() => expect(props.load).toHaveBeenCalledTimes(1));
		await expect.element(screen.getByText('150 件まで表示しています')).toBeInTheDocument();
	});

	it('ボタンは JS が無いときのために次のページへのリンクになっている', async () => {
		const screen = render(LoadMore, {
			href: NEXT,
			load: () => new Promise<void>(() => {}),
			shown: 100,
			unit: '頭'
		});

		await expect.element(screen.getByRole('link')).toHaveAttribute('href', NEXT);
	});

	it('読んでいる間は押せないことを示す', async () => {
		const screen = render(LoadMore, {
			href: NEXT,
			load: () => new Promise<void>(() => {}),
			shown: 100,
			unit: '件'
		});

		const link = screen.getByRole('link', { name: '読み込んでいます…' });
		await expect.element(link).toHaveAttribute('aria-disabled', 'true');
	});

	it('読めなければ文を出し、自動では読み直さず、押せばもう一度読む', async () => {
		const load = vi.fn().mockRejectedValue(new Error('offline'));
		const screen = render(LoadMore, { href: NEXT, load, shown: 100, unit: '件' });

		await expect.element(screen.getByRole('alert')).toHaveTextContent('続きを読み込めませんでした');
		const retry = screen.getByRole('link', { name: 'もう一度読み込む' });
		await expect.element(retry).toBeVisible();
		expect(load).toHaveBeenCalledTimes(1);

		await retry.click();
		await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
	});
});
