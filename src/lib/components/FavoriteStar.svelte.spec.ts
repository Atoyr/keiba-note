import '../../routes/layout.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FavoriteStar from './FavoriteStar.svelte';

describe('FavoriteStar', () => {
	it('推しなら「推しから外す」、そうでなければ「推しにする」を名前と title に出し、塗りを変える', () => {
		const on = render(FavoriteStar, { favorite: true });
		const onBtn = on.getByRole('button', { name: '推しから外す' }).element();
		expect(onBtn.getAttribute('title')).toBe('推しから外す');
		expect(onBtn.getAttribute('type')).toBe('submit');
		expect(onBtn.querySelector('svg')?.getAttribute('class')).toContain('fill-favorite-fill');
		on.unmount();

		const off = render(FavoriteStar, { favorite: false });
		const offBtn = off.getByRole('button', { name: '推しにする' }).element();
		expect(offBtn.querySelector('svg')?.getAttribute('class')).not.toContain('fill-favorite-fill');
	});

	it('馬名があれば名前に入れる', () => {
		const screen = render(FavoriteStar, { favorite: true, horseName: 'テスト馬' });
		expect(screen.getByRole('button', { name: 'テスト馬を推しから外す' }).element()).toBeTruthy();
	});

	it('size で星の大きさを替え、pending は aria-disabled になる', () => {
		const lg = render(FavoriteStar, { favorite: true, size: 'lg', pending: true });
		const btn = lg.getByRole('button').element();
		expect(btn.getAttribute('aria-disabled')).toBe('true');
		expect(btn.querySelector('svg')?.getAttribute('class')).toContain('size-7');
		lg.unmount();
		const md = render(FavoriteStar, { favorite: true });
		expect(md.getByRole('button').element().querySelector('svg')?.getAttribute('class')).toContain(
			'size-5'
		);
	});
});
