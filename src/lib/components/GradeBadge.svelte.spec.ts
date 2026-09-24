import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GradeBadge from './GradeBadge.svelte';
import '../../routes/layout.css';

/** CSS の色（oklch など）を canvas に塗って sRGB に直し、相対輝度を返す。 */
function luminance(color: string): number {
	const ctx = document.createElement('canvas').getContext('2d')!;
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe('GradeBadge', () => {
	it('grade が無ければ何も出さない', () => {
		const screen = render(GradeBadge, { grade: null });

		expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
	});

	// 11px の白抜き文字なので、WCAG AA の 4.5:1 に届いていること
	it.each(['G1', 'G2', 'G3'])('%s の札は文字と地のコントラストが 4.5:1 以上', (grade) => {
		const screen = render(GradeBadge, { grade });
		const badge = screen.container.querySelector<HTMLElement>('[data-slot="badge"]')!;
		const style = getComputedStyle(badge);

		expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
	});
});
