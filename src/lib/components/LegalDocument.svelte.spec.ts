import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import LegalDocument from './LegalDocument.svelte';

const children = createRawSnippet(() => ({
	render: () => '<p>本文</p>'
}));

describe('LegalDocument', () => {
	it('見出しと本文を出す', async () => {
		const screen = render(LegalDocument, {
			title: '利用規約',
			enactedOn: '2026年9月23日',
			updatedOn: '2026年9月23日',
			children
		});

		await expect.element(screen.getByRole('heading', { level: 1, name: '利用規約' })).toBeVisible();
		await expect.element(screen.getByText('本文')).toBeVisible();
	});

	// 改定していないのに「最終改定」を並べると、何か変わったように読める。
	it('改定していなければ制定日だけを出す', async () => {
		const screen = render(LegalDocument, {
			title: '利用規約',
			enactedOn: '2026年9月23日',
			updatedOn: '2026年9月23日',
			children
		});

		await expect.element(screen.getByText('制定: 2026年9月23日')).toBeVisible();
		expect(screen.container.textContent).not.toContain('最終改定');
	});

	it('改定したら最終改定日も出す', async () => {
		const screen = render(LegalDocument, {
			title: '利用規約',
			enactedOn: '2026年9月23日',
			updatedOn: '2026年10月1日',
			children
		});

		await expect.element(screen.getByText(/最終改定: 2026年10月1日/)).toBeVisible();
	});
});
