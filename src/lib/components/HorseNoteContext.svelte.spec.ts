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

it('近況が無くても、ほかのメモがあれば件数と馬の画面への入口を出す', async () => {
	const screen = render(HorseNoteContext, {
		horseId: 'h1',
		notes: [],
		jockey: null,
		summary: null,
		moreCount: 3
	});
	await expect
		.element(screen.getByRole('link', { name: 'ほかに 3 件のメモ。馬の画面で全文・編集を見る' }))
		.toHaveAttribute('href', '/horses/h1');
	await screen.rerender({ horseId: 'h1', notes: [], jockey: null, summary: null, moreCount: 0 });
	expect(document.querySelectorAll('section')).toHaveLength(0);
});

it('馬のメモの見出しの右に、出している近況の件数を出す（騎手のメモには出さない）', async () => {
	const screen = render(HorseNoteContext, {
		horseId: 'h1',
		notes: [1, 2, 3].map((id) => ({
			id: String(id),
			body: `近況${id}`,
			tags: [],
			occurredAt: '2026-05-01'
		})),
		jockey: '見本騎手',
		summary: { body: '騎手のまとめ', tags: [] }
	});
	// 3件渡しても出すのは2件
	await expect.element(screen.getByText('2件', { exact: true })).toBeVisible();
	expect(
		screen.container.querySelector('section[aria-label="騎手のメモ"]')?.textContent
	).not.toMatch(/\d件/);

	// 近況が無く、入口だけを出すときは件数を出さない
	await screen.rerender({ horseId: 'h1', notes: [], jockey: null, summary: null, moreCount: 3 });
	expect(screen.container.querySelector('section[aria-label="馬のメモ"]')?.textContent).not.toMatch(
		/\d件/
	);
});

it('かたまりごとに薄い面（bg-muted/50）にする', () => {
	const screen = render(HorseNoteContext, {
		horseId: 'h1',
		notes: [{ id: '1', body: '近況', tags: [], occurredAt: '2026-05-01' }],
		jockey: '見本騎手',
		summary: { body: '騎手のまとめ', tags: [] }
	});
	for (const section of screen.container.querySelectorAll('section')) {
		expect(section.className).toContain('bg-muted/50');
	}
});
