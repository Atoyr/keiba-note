import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import KindBadge from './KindBadge.svelte';

describe('KindBadge', () => {
	it('label が無ければ何も出さない', () => {
		const screen = render(KindBadge, { label: null });

		expect(screen.container.querySelector('[data-slot="badge"]')).toBeNull();
	});
});
