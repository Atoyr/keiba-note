import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HorseNoteContext from './HorseNoteContext.svelte';

it('馬の近況の要点を2件と騎手のまとめを順に表示し、空の枠を作らない', async () => {
	const screen = render(HorseNoteContext, {
		horseId: 'h1',
		notes: [1, 2, 3].map((id) => ({
			id: String(id),
			body: `近況${id}`,
			tags: [],
			occurredAt: '2026-05-01'
		})),
		jockey: '見本騎手',
		summary: { body: '騎手のまとめ', tags: ['先行が多い'] }
	});
	await expect.element(screen.getByText('近況1', { exact: true })).toBeInTheDocument();
	await expect.element(screen.getByText('近況3', { exact: true })).not.toBeInTheDocument();
	await expect.element(screen.getByText('騎手のまとめ', { exact: true })).toBeInTheDocument();
	await screen.rerender({ horseId: 'h1', notes: [], jockey: null, summary: null });
	expect(document.querySelectorAll('section')).toHaveLength(0);
});

it('騎手名のURL区切り文字を全文・編集リンクにそのまま混ぜない', () => {
	render(HorseNoteContext, {
		horseId: 'h1',
		notes: [],
		jockey: '見本/騎手?#',
		summary: { body: 'まとめ', tags: [] }
	});
	expect(document.querySelector('a')?.getAttribute('href')).toBe(
		`/jockeys/${encodeURIComponent('見本/騎手?#')}`
	);
});
