import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GradeBadge from './GradeBadge.svelte';

describe('GradeBadge', () => {
	it('grade が無ければ何も出さない', () => {
		const screen = render(GradeBadge, { grade: null });

		expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
	});
});
