import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HorseNumberBadge from './HorseNumberBadge.svelte';

describe('HorseNumberBadge', () => {
	// 色が見えない人にも枠と馬番が読めること。色だけに意味を持たせない。
	it('枠番と馬番を、どちらも数字で並べて出す', async () => {
		const screen = render(HorseNumberBadge, { bracket: 2, horseNumber: 3 });

		await expect.element(screen.getByTitle('2枠')).toHaveTextContent('2');
		await expect.element(screen.getByTitle('3番')).toHaveTextContent('3');
	});

	// 読み上げで数字が2つ続くだけにならないよう、札全体に名前を付ける。
	it('札全体を「2枠3番」と読ませる', async () => {
		const screen = render(HorseNumberBadge, { bracket: 2, horseNumber: 3 });

		await expect.element(screen.getByRole('img', { name: '2枠3番' })).toBeVisible();
	});

	it('馬番の面は枠の色を薄くしたもの', async () => {
		const screen = render(HorseNumberBadge, { bracket: 3, horseNumber: 5 });

		await expect.element(screen.getByTitle('5番')).toHaveClass('bg-red-100');
	});

	it('枠があって馬番が無ければ、馬番の欄は − で「馬番未定」', async () => {
		const screen = render(HorseNumberBadge, { bracket: 4, horseNumber: null });

		await expect.element(screen.getByTitle('馬番未定')).toHaveTextContent('−');
	});

	// 枠が決まる前に馬番だけ入ることは無いはずだが、入っても馬番は落とさない。
	it('枠が無ければ、馬番だけを色の無い面で出す', async () => {
		const screen = render(HorseNumberBadge, { bracket: null, horseNumber: 7 });

		await expect.element(screen.getByTitle('7番')).toHaveClass('bg-muted');
		expect(screen.container.querySelector('[title$="枠"]')).toBeNull();
	});

	// 出馬表が出る前のレース。空の札を並べても場所を取るだけ。
	it('枠も馬番も無ければ何も出さない', () => {
		const screen = render(HorseNumberBadge, { bracket: null, horseNumber: null });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
