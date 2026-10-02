import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { emptyFlow } from '$lib/schemas/race-flow';
import { predictionDraftToFields } from '$lib/utils/prediction-draft';
import Fixture from './DraftKeeper.fixture.svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));

beforeEach(() => localStorage.removeItem('test:prediction-draft'));

describe('DraftKeeper.apply', () => {
	it('本文・radio・checkbox・盤面を同期し、送信せず件数と下書きに反映する', async () => {
		const flow = {
			...emptyFlow(),
			pace: 'ハイ' as const,
			start: { spots: [{ entryId: 'e1', x: 0, y: 0 }], memo: 'ハナ' }
		};
		const fields = predictionDraftToFields({
			race: { flow },
			entries: [{ entryId: 'e1', body: 'AIの本文', mark: '◎', tags: ['不利'] }]
		});
		const screen = render(Fixture, { values: fields });
		await screen.getByRole('button', { name: 'AI下書きを適用' }).click();
		await expect.element(screen.getByRole('textbox', { name: '本文' })).toHaveValue('AIの本文');
		expect(
			screen.container.querySelector<HTMLInputElement>('input[name="mark.e1"][value="◎"]')!.checked
		).toBe(true);
		expect(
			screen.container.querySelector<HTMLInputElement>('input[name="tags.e1"][value="不利"]')!
				.checked
		).toBe(true);
		expect(
			screen.container.querySelector<HTMLInputElement>('input[name="tags.e1"][value="次走買い"]')!
				.checked
		).toBe(false);
		await expect.element(screen.getByLabelText('未保存件数')).toHaveTextContent('2');
		await expect.element(screen.getByLabelText('送信件数')).toHaveTextContent('0');
		await screen.getByText('展開の予想', { exact: true }).click();
		await expect
			.element(screen.getByRole('button', { name: '1番 ホースA（先頭・内）' }))
			.toBeVisible();
		expect(
			screen.container.querySelector<HTMLInputElement>('input[name="flowSpots.start"]')!.value
		).toBe(JSON.stringify(flow.start.spots));
		await expect
			.poll(() => JSON.parse(localStorage.getItem('test:prediction-draft') ?? '{}').fields)
			.toEqual({
				'body.e1': ['AIの本文'],
				'mark.e1': ['◎'],
				'tags.e1': ['不利'],
				racePace: ['ハイ'],
				'flowSpots.start': fields['flowSpots.start'],
				'flowMemo.start': ['ハナ']
			});
	});
	it('省略された人間の本文を保ち、明示クリアは選択を外す', async () => {
		const screen = render(Fixture, {
			values: predictionDraftToFields({ entries: [{ entryId: 'e1', mark: null, tags: [] }] })
		});
		await screen.getByRole('button', { name: 'AI下書きを適用' }).click();
		await expect.element(screen.getByRole('textbox', { name: '本文' })).toHaveValue('人間の本文');
		expect(
			screen.container.querySelector<HTMLInputElement>('input[name="mark.e1"][value=""]')!.checked
		).toBe(true);
		expect(screen.container.querySelectorAll('input[name="tags.e1"]:checked')).toHaveLength(0);
		await expect.element(screen.getByLabelText('未保存件数')).toHaveTextContent('1');
	});
});
