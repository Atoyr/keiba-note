import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MarkPicker from './MarkPicker.svelte';

describe('MarkPicker', () => {
	it('印を ◎ ○ ▲ △ ☆ × の順に並べ、最後に「なし」を置く', async () => {
		const screen = render(MarkPicker, { name: 'mark.x', value: '☆' });

		const values = Array.from(
			screen.container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
		).map((r) => r.value);
		expect(values).toEqual(['◎', '○', '▲', '△', '☆', '×', '']);
		await expect.element(screen.getByRole('radio', { name: '☆' })).toBeChecked();
	});
});
