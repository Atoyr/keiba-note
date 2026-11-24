import '../../routes/layout.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FinishTime from './FinishTime.svelte';

const base = { date: '2025-11-30', course: '東京', surface: '芝', distance: 2400 };

describe('FinishTime', () => {
	it('レコードのタイムは黒地に白文字で、「レコード」を title と読み上げに出す', () => {
		const { container } = render(FinishTime, { ...base, time: '2:20.3' });
		const span = container.querySelector('span.font-mono');
		expect(span?.className).toContain('bg-black');
		expect(span?.className).toContain('text-white');
		expect(span?.getAttribute('title')).toBe('レコード');
		expect(container.textContent).toContain('（レコード）');
	});

	it('レコードでなければ今までの見た目で、何も足さない', () => {
		const { container } = render(FinishTime, { ...base, time: '2:20.4' });
		const span = container.querySelector('span.font-mono');
		expect(span?.className).not.toContain('bg-black');
		expect(span?.getAttribute('title')).toBeNull();
		expect(container.textContent).not.toContain('レコード');
	});
});
