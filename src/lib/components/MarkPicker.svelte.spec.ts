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

	// 選んだ印にマウスを乗せても、塗りと輪郭が hover の色に置き換わらない（◎ の白い字が消えない）。
	it('hover の色は選んでいない印にだけ付ける', async () => {
		const screen = render(MarkPicker, { name: 'mark.x', value: '◎' });

		for (const span of screen.container.querySelectorAll(
			'input[value="◎"] + span, input[value="×"] + span'
		)) {
			expect(span.className).toContain('peer-not-checked:hover:bg-accent');
			expect(span.className).not.toMatch(/(^|\s)hover:bg-accent/);
		}
	});
});
