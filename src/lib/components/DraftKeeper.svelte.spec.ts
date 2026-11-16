import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { emptyFlow } from '#lib/schemas/race-flow.ts';
import Harness from './DraftKeeper.test.svelte';
import RestoreHarness from './DraftKeeper.restore.test.svelte';

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

describe('DraftKeeper.onrestore', () => {
	it('「復元する」を押すと下書きを欄へ入れてから onrestore を呼ぶ。押すまでは呼ばない', async () => {
		const key = 'uma-memo:test:restore';
		localStorage.setItem(
			key,
			JSON.stringify({ savedAt: Date.now(), fields: { body: ['書きかけ'] } })
		);
		const onrestore = vi.fn();
		const screen = render(RestoreHarness, { storageKey: key, onrestore });
		const field = screen.container.querySelector<HTMLTextAreaElement>('[name="body"]')!;

		await expect.element(screen.getByRole('button', { name: '復元する' })).toBeVisible();
		expect(onrestore).not.toHaveBeenCalled();
		expect(field.value).toBe('');

		await screen.getByRole('button', { name: '復元する' }).click();
		expect(field.value).toBe('書きかけ');
		expect(onrestore).toHaveBeenCalledTimes(1);
		localStorage.removeItem(key);
	});

	it('「破棄」を押しても onrestore は呼ばず、欄も変えない', async () => {
		const key = 'uma-memo:test:discard';
		localStorage.setItem(
			key,
			JSON.stringify({ savedAt: Date.now(), fields: { body: ['書きかけ'] } })
		);
		const onrestore = vi.fn();
		const screen = render(RestoreHarness, { storageKey: key, onrestore });
		const field = screen.container.querySelector<HTMLTextAreaElement>('[name="body"]')!;

		await screen.getByRole('button', { name: '破棄' }).click();
		await expect.element(screen.getByRole('button', { name: '復元する' })).not.toBeInTheDocument();
		expect(field.value).toBe('');
		expect(onrestore).not.toHaveBeenCalled();
		localStorage.removeItem(key);
	});
});
