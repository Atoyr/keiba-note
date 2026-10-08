import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SexAgeBadge from './SexAgeBadge.svelte';

describe('SexAgeBadge', () => {
	// 馬詳細の性齢の札と同じ配色（牡=青・牝=ピンク・セ=緑）。
	it.each([
		['牡', '牡4', 'blue'],
		['牝', '牝5', 'pink'],
		['セ', 'セ7', 'emerald']
	] as const)('%s は %s を %s の系統の札で出す', async (sex, label, color) => {
		const screen = render(SexAgeBadge, { sex, label });

		const badge = screen.container.querySelector('span');
		expect(badge?.className).toContain(`bg-${color}-50`);
		expect(badge?.className).toContain(`border-${color}-300`);
		await expect.element(screen.getByText(label)).toBeVisible();
	});

	// 性が分からず馬齢だけのとき（`4歳`）は無彩色。
	it('性が無ければ無彩色の札で出す', async () => {
		const screen = render(SexAgeBadge, { sex: null, label: '4歳' });

		const badge = screen.container.querySelector('span');
		expect(badge?.className).toContain('bg-background');
		expect(badge?.className).not.toMatch(/bg-(blue|pink|emerald)-50/);
		await expect.element(screen.getByText('4歳')).toBeVisible();
	});

	it('読み上げに「性齢」が入る', async () => {
		const screen = render(SexAgeBadge, { sex: '牡', label: '牡4' });

		const badge = screen.container.querySelector('span');
		expect(badge?.textContent).toContain('性齢');
		expect(badge?.querySelector('.sr-only')?.textContent).toBe('性齢');
	});

	it('label が null なら何も描かない', () => {
		const screen = render(SexAgeBadge, { sex: '牡', label: null });

		expect(screen.container.querySelector('span')).toBeNull();
	});
});
