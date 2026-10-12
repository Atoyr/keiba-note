import { describe, expect, it, vi } from 'vitest';
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

	// 閉じた行の見出しが追従できるよう、選ばれた印を返す。泡立たない change（下書きの書き戻し）も拾う。
	it('選んだ印を onpick で返し、「なし」は null、泡立たない change も拾う', async () => {
		const onpick = vi.fn();
		const screen = render(MarkPicker, { name: 'mark.x', value: null, onpick });

		await screen.getByRole('radio', { name: '◎' }).click({ force: true });
		expect(onpick).toHaveBeenLastCalledWith('◎');
		await screen.getByRole('radio', { name: 'なし' }).click({ force: true });
		expect(onpick).toHaveBeenLastCalledWith(null);

		const circle = screen.container.querySelector<HTMLInputElement>('input[value="○"]')!;
		circle.checked = true;
		circle.dispatchEvent(new Event('change'));
		expect(onpick).toHaveBeenLastCalledWith('○');
		expect(onpick).toHaveBeenCalledTimes(3);
	});
});
