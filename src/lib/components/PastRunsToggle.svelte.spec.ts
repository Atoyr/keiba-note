import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PastRunsToggle, { PAST_RUNS_STRIP_KEY } from './PastRunsToggle.svelte';

afterEach(() => localStorage.removeItem(PAST_RUNS_STRIP_KEY));

const button = (container: Element) =>
	container.querySelector<HTMLButtonElement>('button[aria-pressed]')!;

describe('PastRunsToggle', () => {
	it('既定はOFFで、押すとONになって端末に残る', async () => {
		const { container } = render(PastRunsToggle, {});

		expect(button(container).getAttribute('aria-pressed')).toBe('false');
		button(container).click();
		await expect.poll(() => button(container).getAttribute('aria-pressed')).toBe('true');
		expect(localStorage.getItem(PAST_RUNS_STRIP_KEY)).toBe('1');
	});

	it('もう一度押すとOFFに戻り、残した値を消す', async () => {
		localStorage.setItem(PAST_RUNS_STRIP_KEY, '1');
		const { container } = render(PastRunsToggle, {});

		await expect.poll(() => button(container).getAttribute('aria-pressed')).toBe('true');
		button(container).click();
		await expect.poll(() => button(container).getAttribute('aria-pressed')).toBe('false');
		expect(localStorage.getItem(PAST_RUNS_STRIP_KEY)).toBeNull();
	});

	it('名前は「馬柱を表示」', () => {
		const { container } = render(PastRunsToggle, {});

		expect(button(container).textContent?.trim()).toBe('馬柱を表示');
	});
});
