import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { emptyFlow } from '$lib/schemas/race-flow';
import Harness from './DraftKeeper.test.svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
const storageKey = 'uma-memo:test:webmcp';
afterEach(() => localStorage.removeItem(storageKey));

describe('DraftKeeper.apply', () => {
	it('部分更新を未保存に数え、入力部品と展開の盤面を同期する。送信はしない', async () => {
		const screen = render(Harness, { storageKey });
		const submitted = vi.fn();
		screen.container.querySelector('form')!.addEventListener('submit', submitted);
		const body = screen.container.querySelector<HTMLTextAreaElement>('[name="body.e1"]')!;
		await screen.component.apply({
			race: {
				flow: {
					...emptyFlow(),
					pace: 'ハイ',
					start: { spots: [{ entryId: 'e1', x: 0, y: 0 }], memo: 'ハナへ' }
				}
			},
			entries: [{ entryId: 'e1', body: 'AIのメモ', mark: '◎', tags: ['不利', '好上がり'] }]
		});
		expect(body.value).toBe('AIのメモ');
		expect(
			screen.container.querySelector<HTMLTextAreaElement>('[name="raceNoteBody"]')!.value
		).toBe('人間の見立て');
		expect(
			screen.container.querySelector<HTMLInputElement>('[name="mark.e1"][value="◎"]')!.checked
		).toBe(true);
		expect(
			screen.container.querySelector<HTMLInputElement>('[name="tags.e1"][value="不利"]')!.checked
		).toBe(true);
		expect(
			screen.container.querySelector<HTMLInputElement>('[name="tags.e1"][value="次走買い"]')!
				.checked
		).toBe(false);
		expect(screen.container.querySelector('output')!.textContent).toBe('2');
		expect(submitted).not.toHaveBeenCalled();
		await screen.getByText('展開の予想').click();
		await expect
			.element(screen.getByRole('button', { name: '1番 ホースA（先頭・内）' }))
			.toBeVisible();
		expect(screen.container.querySelector('summary')!.textContent).toContain('ハイ');
		expect(
			screen.container.querySelector<HTMLInputElement>('[name="flowSpots.start"]')!.value
		).toBe('[{"entryId":"e1","x":0,"y":0}]');
		expect(screen.container.querySelector<HTMLInputElement>('[name="flowMemo.start"]')!.value).toBe(
			'ハナへ'
		);
		await expect
			.poll(() => JSON.parse(localStorage.getItem(storageKey) ?? '{}').fields)
			.toMatchObject({ 'body.e1': ['AIのメモ'], 'mark.e1': ['◎'], racePace: ['ハイ'] });
		const event = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		await screen.component.apply({
			race: { pace: null, flow: null },
			entries: [{ entryId: 'e1', body: '', mark: null, tags: [] }]
		});
		expect(body.value).toBe('');
		expect(
			screen.container.querySelector<HTMLInputElement>('[name="mark.e1"][value=""]')!.checked
		).toBe(true);
		expect(screen.container.querySelectorAll('[name="tags.e1"]:checked')).toHaveLength(0);
		expect(screen.container.querySelector('summary')!.textContent).toContain('＋ 書く');
	});
});
