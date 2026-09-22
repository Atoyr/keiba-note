import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BracketBadge from './BracketBadge.svelte';

/**
 * 色そのものが仕様なので、クラス名で塗りを確かめる。
 * JRA の帽子の色（1白 / 2黒 / 3赤 / 4青 / 5黄 / 6緑 / 7橙 / 8桃）から
 * ずれると、中継を見ながら読む人の頭の中と食い違う。
 */
describe('BracketBadge', () => {
	it.each([
		[1, 'bg-white', 'text-gray-900'],
		[2, 'bg-gray-900', 'text-white'],
		[3, 'bg-red-600', 'text-white'],
		[4, 'bg-blue-600', 'text-white'],
		[5, 'bg-yellow-300', 'text-gray-900'],
		[6, 'bg-green-600', 'text-white'],
		[7, 'bg-orange-400', 'text-gray-900'],
		[8, 'bg-pink-300', 'text-gray-900']
	])('%i枠を %s / %s で塗る', async (bracket, bg, fg) => {
		const screen = render(BracketBadge, { bracket });

		const badge = screen.getByText(String(bracket));
		await expect.element(badge).toBeInTheDocument();
		expect(badge.element().className).toContain(bg);
		expect(badge.element().className).toContain(fg);
	});

	// 色が見えない人にも枠が読めること。色だけに意味を持たせない。
	it('色だけでなく枠番の数字も出す', async () => {
		const screen = render(BracketBadge, { bracket: 6 });

		const badge = screen.getByTitle('6枠');
		await expect.element(badge).toHaveTextContent('6');
	});

	// 枠が決まる前に名前だけで登録する運用があるので、NULL は必ず通る。
	it.each([null, 0, 9])('枠が %s のときは何も出さない', (bracket) => {
		const screen = render(BracketBadge, { bracket: bracket as number | null });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
