import { expect, test } from '@playwright/test';
import { emptyFlow } from '../src/lib/schemas/race-flow';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import {
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	SAME_CONDITION_NOTE_BODY,
	OTHER_USER_SAME_CONDITION_BODY
} from './seed';
import { applyPrediction, mockPredictionTools, predictionContext } from './webmcp';
import type { ModelContextTool } from '../src/lib/webmcp/support';

test('AI下書きはフォーム・盤面・下書きに同期し、既存保存からだけ保存される', async ({
	page,
	context: browserContext
}) => {
	await login(page, 'admin');
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${BRACKET_RACE_ID}/preview`);
	const context = await predictionContext(page);
	const [first, second] = context.entries;
	const firstBody = page.locator(`textarea[name="body.${first.entryId}"]`);
	const secondBody = page.locator(`textarea[name="body.${second.entryId}"]`);
	// 人間の未保存入力にも触れない。
	await secondBody.evaluate((el: HTMLTextAreaElement) => {
		el.value = '人間の見解';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	const posts: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST') posts.push(request.url());
	});
	const flow = {
		...emptyFlow(),
		pace: 'ハイ' as const,
		start: { spots: [{ entryId: first.entryId, x: 0, y: 0 }], memo: 'ハナを取る' }
	};
	await expect(
		applyPrediction(page, {
			race: { body: 'AIの見立て', flow },
			entries: [{ entryId: first.entryId, body: 'AIの見解', mark: '◎', tags: ['不利', '次走買い'] }]
		})
	).resolves.toEqual({ status: 'applied', saved: false });
	await expect(firstBody).toHaveValue('AIの見解');
	await expect(secondBody).toHaveValue('人間の見解');
	await expect(page.locator(`input[name="mark.${first.entryId}"][value="◎"]`)).toBeChecked();
	await expect(page.locator(`input[name="tags.${first.entryId}"][value="不利"]`)).toBeChecked();
	await expect(page.locator('input[name="racePace"][value="ハイ"]')).toBeChecked();
	await expect(page.getByText('未保存の変更が 3 件あります')).toBeVisible();
	await expect(page.locator('[data-sonner-toast]')).toContainText('保存前に内容を確認してください');
	const editor = page.locator('details', { hasText: '展開の予想' });
	await editor.locator('summary').click();
	await expect(
		editor.getByRole('button', { name: `${first.horseNumber}番 ${first.horseName}（先頭・内）` })
	).toBeVisible();
	await expect(page.locator('input[name="flowSpots.start"]')).toHaveValue(
		JSON.stringify(flow.start.spots)
	);
	await expect
		.poll(() =>
			page.evaluate(() =>
				Object.values(localStorage).some(
					(raw) => raw.includes('AIの見解') && raw.includes('flowSpots.start')
				)
			)
		)
		.toBe(true);
	expect(posts).toEqual([]);
	// 別タブでサーバーの保存済み値を見る。WebMCPではD1に届いていない。
	const observer = await browserContext.newPage();
	await gotoHydrated(observer, `/races/${BRACKET_RACE_ID}/preview`);
	await expect(observer.locator(`textarea[name="body.${first.entryId}"]`)).toHaveValue('');
	await observer.close();
	const current = await predictionContext(page);
	expect(current.entries[0].myCurrentPrediction?.body).toBe('AIの見解');
	// 明示クリアも同期し、本文省略はそのまま。
	await applyPrediction(page, {
		race: { pace: null },
		entries: [{ entryId: first.entryId, mark: null, tags: [] }]
	});
	await expect(page.locator('input[name="racePace"][value=""]')).toBeChecked();
	await expect(editor.locator('summary')).not.toContainText('ハイ');
	await expect(page.locator(`input[name="mark.${first.entryId}"][value=""]`)).toBeChecked();
	await expect(page.locator(`input[name="tags.${first.entryId}"]:checked`)).toHaveCount(0);
	await expect(firstBody).toHaveValue('AIの見解');
	await applyPrediction(page, {
		race: { pace: 'ハイ' },
		entries: [{ entryId: first.entryId, mark: '◎', tags: ['次走買い', '不利'] }]
	});
	// reloadの離脱警告、下書きの明示復元、hiddenから盤面の復元。
	await expect
		.poll(() =>
			page.evaluate(() => Object.values(localStorage).some((raw) => raw.includes('AIの見解')))
		)
		.toBe(true);
	page.once('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await waitForHydration(page);
	await page.getByRole('button', { name: '復元する' }).click();
	await expect(firstBody).toHaveValue('AIの見解');
	await expect(editor.locator('summary')).toContainText('ハイ');
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.locator('[data-sonner-toast]')).toContainText('保存しました（3 件）');
	expect(posts).toHaveLength(1);
	await page.reload();
	await waitForHydration(page);
	await expect(firstBody).toHaveValue('AIの見解');
	await expect(secondBody).toHaveValue('人間の見解');
	await expect(page.locator(`input[name="mark.${first.entryId}"][value="◎"]`)).toBeChecked();
	await expect(editor.locator('summary')).toContainText('ハイ');
	await expect(page.locator('input[name="flowMemo.start"]')).toHaveValue('ハナを取る');
	await expect(page.getByText(/未保存の変更が/)).toHaveCount(0);
});

test('予想材料を本人のloadから取得し、不正IDは全体を拒否する', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	const context = await predictionContext(page);
	expect(context.race.id).toBe(PREVIEW_RACE_ID);
	expect(context.entries[0].odds).toMatchObject({
		win: 3.4,
		placeMin: 1.4,
		placeMax: 1.8,
		popularity: 1
	});
	expect(context.oddsAsOf).toBeGreaterThan(0);
	expect(context.entries[0].myHistory.length).toBeGreaterThan(0);
	expect(context.entries[0].pastRuns.length).toBeGreaterThan(0);
	expect(context.sameConditionNotes.map((n) => n.body)).toContain(SAME_CONDITION_NOTE_BODY);
	expect(JSON.stringify(context)).not.toContain(OTHER_USER_SAME_CONDITION_BODY);
	const body = page.locator('textarea[name="raceNoteBody"]');
	const original = await body.inputValue();
	expect(
		await applyPrediction(page, {
			race: { body: '適用しない' },
			entries: [{ entryId: 'other-race-entry', mark: '◎' }]
		})
	).toMatchObject({ status: 'rejected', reason: 'unknown_entry' });
	await expect(body).toHaveValue(original);
	expect(
		await applyPrediction(page, {
			race: {
				body: '適用しない',
				flow: {
					...emptyFlow(),
					corner4: { spots: [{ entryId: 'other-race-entry', x: 0, y: 0 }], memo: '' }
				}
			},
			entries: []
		})
	).toMatchObject({ reason: 'unknown_entry' });
	await expect(body).toHaveValue(original);
	await expect(page.getByText(/未保存の変更が/)).toHaveCount(0);
});

test('SPAで別レースに移ったときは旧toolを解除し、新レースだけを対象にする', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	const context = await predictionContext(page);
	await page.evaluate(async (target) => {
		const win = window as Window & {
			predictionTools: Map<string, ModelContextTool>;
			previousPredictionTool?: ModelContextTool;
		};
		win.previousPredictionTool = win.predictionTools.get('apply_prediction_draft');
		const anchor = document.createElement('a');
		anchor.href = target;
		document.body.append(anchor);
		anchor.click();
	}, `/races/${EMPTY_RACE_ID}/preview`);
	await expect(page).toHaveURL(new RegExp(`${EMPTY_RACE_ID}/preview`));
	await expect.poll(async () => (await predictionContext(page)).race.id).toBe(EMPTY_RACE_ID);
	expect(
		await page.evaluate(() =>
			(
				window as Window & { previousPredictionTool: ModelContextTool }
			).previousPredictionTool.execute({ entries: [] }, { signal: new AbortController().signal })
		)
	).toMatchObject({ reason: 'inactive_page' });
	expect(
		await applyPrediction(page, { entries: [{ entryId: context.entries[0].entryId, mark: '◎' }] })
	).toMatchObject({ reason: 'unknown_entry' });
	expect(await applyPrediction(page, { race: { pace: 'ハイ' }, entries: [] })).toMatchObject({
		reason: 'flow_unavailable'
	});
	await applyPrediction(page, { race: { body: '出馬表前の下書き' }, entries: [] });
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	// アプリ内の移動でも警告が出て、キャンセルで下書きを保つ。
	page.once('dialog', (dialog) => void dialog.dismiss());
	await page.getByRole('link', { name: '予想をまとめて見る' }).click();
	await expect(page).toHaveURL(new RegExp(`${EMPTY_RACE_ID}/preview`));
	await expect(page.locator('textarea[name="raceNoteBody"]')).toHaveValue('出馬表前の下書き');
});

test('非対応ブラウザでも通常の予想入力を続けられる', async ({ page }) => {
	await page.addInitScript(() =>
		Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })
	);
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await page.locator('textarea[name="raceNoteBody"]').fill('通常の入力');
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	await expect(page.getByRole('button', { name: '出走前メモを保存' })).toBeVisible();
});
