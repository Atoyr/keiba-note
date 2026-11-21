import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import FinishStatusLabel from './FinishStatusLabel.svelte';

describe('FinishStatusLabel', () => {
	it('状態の語をそのまま出す', async () => {
		for (const status of ['取消', '除外', '中止', '失格'] as const) {
			const { unmount } = render(FinishStatusLabel, { status });
			await expect.element(page.getByText(status, { exact: true })).toBeVisible();
			unmount();
		}
	});

	it('状態が無ければ何も描かない', () => {
		const { container } = render(FinishStatusLabel, { status: null });
		expect(container.textContent?.trim()).toBe('');
	});
});
