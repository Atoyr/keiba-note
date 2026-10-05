import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import KindBadge from './KindBadge.svelte';

describe('KindBadge', () => {
	it('label が無ければ何も出さない', () => {
		const screen = render(KindBadge, { label: null });

		expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
	});

	it('重賞のタイムラインの札（予想・ふりかえり・開催予定）をそのまま出す', () => {
		for (const label of ['予想', 'ふりかえり', '開催予定'] as const) {
			const screen = render(KindBadge, { label });

			expect(screen.container.querySelector('[data-slot="badge"]')?.textContent?.trim()).toBe(
				label
			);
		}
	});
});
