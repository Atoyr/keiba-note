import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import KindBadge from './KindBadge.svelte';

/**
 * タイムラインは「メモのある行」と「走っただけの行」が混ざる。
 * 塗るのは前を向いている2つ（これから走る／レース前に書いた）だけにして、
 * 数の多いメモ無しの出走が画面を支配しないようにしている。色そのものが仕様。
 */
describe('KindBadge', () => {
	it.each([
		['出走前', 'bg-sky-100'],
		['出走予定', 'bg-emerald-100']
	] as const)('%s は %s で塗る', async (label, bg) => {
		const screen = render(KindBadge, { label });

		const badge = screen.getByText(label);
		await expect.element(badge).toBeInTheDocument();
		expect(badge.element().className).toContain(bg);
	});

	it.each(['近況', '出走'] as const)('%s は塗らない', async (label) => {
		const screen = render(KindBadge, { label });

		const badge = screen.getByText(label);
		await expect.element(badge).toBeInTheDocument();
		expect(badge.element().className).not.toMatch(/bg-(sky|emerald)-100/);
	});

	it('label が無ければ何も出さない', () => {
		const screen = render(KindBadge, { label: null });

		expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
	});
});
