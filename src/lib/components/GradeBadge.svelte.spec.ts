import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GradeBadge from './GradeBadge.svelte';

/**
 * 色そのものが仕様なので、クラス名で塗りを確かめる。
 * 画面ごとに札の見た目がずれていた経緯があるため、
 * G1 / G2 / G3 の色は回帰しやすいところとして押さえておく。
 */
describe('GradeBadge', () => {
	it.each([
		['G1', 'bg-blue-600'],
		['G2', 'bg-red-600'],
		['G3', 'bg-green-600']
	])('%s を %s で塗る', async (grade, bg) => {
		const screen = render(GradeBadge, { grade });

		const badge = screen.getByText(grade);
		await expect.element(badge).toBeInTheDocument();
		expect(badge.element().className).toContain(bg);
		expect(badge.element().className).toContain('text-white');
	});

	it.each(['L', 'OP'])('%s は塗らずに輪郭だけにする', async (grade) => {
		const screen = render(GradeBadge, { grade });

		const badge = screen.getByText(grade);
		await expect.element(badge).toBeInTheDocument();
		expect(badge.element().className).not.toMatch(/bg-(blue|red|green)-600/);
		expect(badge.element().className).toContain('border-border');
	});

	it('grade が無ければ何も出さない', () => {
		const screen = render(GradeBadge, { grade: null });

		expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
	});
});
