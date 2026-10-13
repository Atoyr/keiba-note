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

// 横いっぱいに等幅で並べる（6つの印 + なし）。「なし」も印と同じ形の札にする。
it('6つの印と「なし」を同じ高さ・同じ幅の札として7列に並べる', () => {
	const screen = render(MarkPicker, { name: 'mark.x', value: null });

	const group = screen.container.querySelector('[role="radiogroup"]')!;
	expect(group.className).toContain('grid-cols-7');
	const tiles = group.querySelectorAll('input + span');
	expect(tiles).toHaveLength(7);
	for (const tile of tiles) {
		expect(tile.className).toContain('h-10');
		expect(tile.className).toContain('w-full');
		expect(tile.className).toContain('border');
	}
});

it('「なし」を選ぶと枠が濃くなる（選んだ状態が枠で分かる）', async () => {
	const screen = render(MarkPicker, { name: 'mark.x', value: '◎' });

	const none = screen.container.querySelector('input[value=""] + span')!;
	expect(none.className).toContain('peer-checked:border-foreground');
	await screen.getByRole('radio', { name: 'なし' }).click({ force: true });
	await expect.element(screen.getByRole('radio', { name: 'なし' })).toBeChecked();
});
