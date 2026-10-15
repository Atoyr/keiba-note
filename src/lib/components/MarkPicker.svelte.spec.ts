import '../../routes/layout.css';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MarkPicker from './MarkPicker.svelte';

describe('MarkPicker', () => {
	it('印を ◎ ○ ▲ △ ☆ ✓ × の順に並べ（✓ は候補で ☆ と × の間）、最後に「なし」を置く', async () => {
		const screen = render(MarkPicker, { name: 'mark.x', value: '☆' });

		const values = Array.from(
			screen.container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
		).map((r) => r.value);
		expect(values).toEqual(['◎', '○', '▲', '△', '☆', '✓', '×', '']);
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

		await screen.getByText('◎', { exact: true }).click();
		expect(onpick).toHaveBeenLastCalledWith('◎');
		await screen.getByText('なし', { exact: true }).click();
		expect(onpick).toHaveBeenLastCalledWith(null);

		const circle = screen.container.querySelector<HTMLInputElement>('input[value="○"]')!;
		circle.checked = true;
		circle.dispatchEvent(new Event('change'));
		expect(onpick).toHaveBeenLastCalledWith('○');
		expect(onpick).toHaveBeenCalledTimes(3);
	});

	// ✓ は「チェックマーク」と読まれて意味が伝わらないので、候補と添える。
	it('✓ は読み上げの名前に「候補」が入り、選ぶと onpick に ✓ を返す', async () => {
		const onpick = vi.fn();
		const screen = render(MarkPicker, { name: 'mark.x', value: null, onpick });

		const radio = screen.getByRole('radio', { name: /候補/ });
		await expect.element(radio).toBeInTheDocument();
		// 札（span）の中に読み上げ用の「候補」があり、getByText の完全一致では取れないので、札を直に押す。
		screen.container.querySelector<HTMLElement>('input[value="✓"] + span')!.click();
		expect(onpick).toHaveBeenLastCalledWith('✓');
		await expect.element(radio).toBeChecked();
		await expect.element(radio).toHaveAttribute('value', '✓');
		// 候補の色は teal（予想の印のどれとも違う）。
		expect(screen.container.querySelector('input[value="✓"] + span')!.className).toContain(
			'peer-checked:bg-teal-100'
		);
	});
});

// 正方形の札（40px 四方）を左寄せで並べる（7つの印 + なし）。「なし」も印と同じ大きさにする。
it('7つの印と「なし」を、40px 四方の同じ札として左寄せで並べる', () => {
	const screen = render(MarkPicker, { name: 'mark.x', value: null });

	const group = screen.container.querySelector<HTMLElement>('[role="radiogroup"]')!;
	const tiles = Array.from(group.querySelectorAll<HTMLElement>('input + span'));
	expect(tiles).toHaveLength(8);
	for (const tile of tiles) {
		const box = tile.getBoundingClientRect();
		expect(box.width).toBe(40);
		expect(box.height).toBe(40);
		expect(tile.className).toContain('border');
	}
	// 左寄せ: 先頭の札は箱の左端から始まり、札の右端は箱の右端まで伸びない（横いっぱいに広がらない）。
	const first = tiles[0].getBoundingClientRect();
	const last = tiles[7].getBoundingClientRect();
	const groupBox = group.getBoundingClientRect();
	expect(first.left).toBe(groupBox.left);
	expect(last.right).toBeLessThan(groupBox.right);
});

it('label が radiogroup の名前になり、省略すると「予想印」', async () => {
	const named = render(MarkPicker, { name: 'mark.x', label: '見本馬の予想印' });
	await expect.element(named.getByRole('radiogroup', { name: '見本馬の予想印' })).toBeVisible();
	named.unmount();
	const plain = render(MarkPicker, { name: 'mark.y' });
	await expect.element(plain.getByRole('radiogroup', { name: '予想印' })).toBeVisible();
});

it('「なし」を選ぶと枠が濃くなる（選んだ状態が枠で分かる）', async () => {
	const screen = render(MarkPicker, { name: 'mark.x', value: '◎' });

	const none = screen.container.querySelector('input[value=""] + span')!;
	expect(none.className).toContain('peer-checked:border-foreground');
	await screen.getByText('なし', { exact: true }).click();
	await expect.element(screen.getByRole('radio', { name: 'なし' })).toBeChecked();
});
