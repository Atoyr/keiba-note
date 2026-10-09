import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import {
	MARKS_RACE_ID,
	PREVIEW_RACE_ID,
	SAME_CONDITION_NOTE_BODY,
	OTHER_USER_SAME_CONDITION_BODY,
	WEBMCP_RACE_ID,
	WEBMCP_ENTRY_IDS
} from './seed';
import { applyPrediction, mockPredictionTools } from './webmcp';
import { emptyFlow } from '../src/lib/schemas/race-flow';
import type { PredictionContext } from '../src/lib/webmcp/prediction';

test('AI下書きは部分更新・未保存になり、人間のまとめて保存後だけ永続化する', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${WEBMCP_RACE_ID}/preview`);
	await expect.poll(() => page.evaluate(() => window.__predictionTools.size)).toBe(2);
	const [first, second] = WEBMCP_ENTRY_IDS;
	const row = (id: string) => page.locator(`#entry-${id}`);
	await row(first).getByText('＋ 出走前メモ').click();
	await row(first).locator('textarea').fill('人間の本文を維持');
	await row(second).getByText('＋ 出走前メモ').click();
	await row(second).locator('textarea').fill('指定していない馬を維持');
	await row(second).getByText('次走買い', { exact: true }).click();
	let posts = 0;
	page.on('request', (request) => {
		if (request.method() === 'POST') posts++;
	});
	const flow = {
		...emptyFlow(),
		pace: 'ハイ' as const,
		start: { spots: [{ entryId: first, x: 0, y: 0 }], memo: 'ハナへ' }
	};
	expect(
		await applyPrediction(page, {
			race: { body: 'AIの見立て', flow },
			entries: [{ entryId: first, mark: '◎', tags: ['不利'] }]
		})
	).toEqual({ status: 'applied', saved: false });
	await expect(
		page.getByText('AIの予想を下書きに反映しました。保存前に内容を確認してください')
	).toBeVisible();
	await expect(page.getByText('未保存の変更が 3 件あります')).toBeVisible();
	await expect(row(first).locator('textarea')).toHaveValue('人間の本文を維持');
	await expect(row(second).locator('textarea')).toHaveValue('指定していない馬を維持');
	await expect(row(first).getByRole('radio', { name: '◎', exact: true })).toBeChecked();
	await expect(row(second).getByRole('checkbox', { name: '次走買い' })).toBeChecked();
	const editor = page.locator('details', { hasText: '展開の予想' });
	await editor.locator('summary').click();
	await expect(editor.getByRole('button', { name: /1番.*（先頭・内）/ })).toBeVisible();
	await expect(editor.getByRole('radio', { name: 'ハイ', exact: true })).toBeChecked();
	await expect
		.poll(() =>
			page.evaluate(
				() => Object.keys(localStorage).filter((key) => key.includes('draft:preview')).length
			)
		)
		.toBe(1);
	expect(posts).toBe(0);
	// 同じ URL をサーバーから読み、下書きが D1 に届いていないことを確認。
	const unsaved = await page.request.get(`/races/${WEBMCP_RACE_ID}/preview`);
	expect(await unsaved.text()).not.toContain('AIの見立て');
	const warning = page.waitForEvent('dialog').then(async (dialog) => {
		expect(dialog.type()).toBe('confirm');
		await dialog.dismiss();
	});
	await page.getByRole('link', { name: '予想をまとめて見る' }).click();
	await warning;
	await expect(page).toHaveURL(new RegExp(`${WEBMCP_RACE_ID}/preview$`));
	// 再読み込み後も下書きを復元でき、保存前の本文・札・展開が失われない。
	page.once('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await waitForHydration(page);
	await page.getByRole('button', { name: '復元する' }).click();
	await expect(page.locator('[name="raceNoteBody"]')).toHaveValue('AIの見立て');
	await expect(row(first).locator('textarea')).toHaveValue('人間の本文を維持');
	await expect(row(second).locator('textarea')).toHaveValue('指定していない馬を維持');
	await expect(page.getByText('未保存の変更が 3 件あります')).toBeVisible();
	await editor.locator('summary').click();
	await expect(editor.getByRole('button', { name: /1番.*（先頭・内）/ })).toBeVisible();
	await expect(page.locator('[name="flowMemo.start"]')).toHaveValue('ハナへ');
	expect(posts).toBe(0);
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（3 件）')).toBeVisible();
	expect(posts).toBe(1);
	await page.reload();
	await waitForHydration(page);
	await expect(page.locator('[name="raceNoteBody"]')).toHaveValue('AIの見立て');
	await expect(row(first).locator('textarea')).toHaveValue('人間の本文を維持');
	await expect(row(first).getByRole('radio', { name: '◎', exact: true })).toBeChecked();
	await expect(page.locator('[name="flowMemo.start"]')).toHaveValue('ハナへ');
	await expect(page.getByText('未保存の変更', { exact: false })).toBeHidden();
	await expect
		.poll(() =>
			page.evaluate(
				() => Object.keys(localStorage).filter((key) => key.includes('draft:preview')).length
			)
		)
		.toBe(0);
});

test('現在のレース・オッズ・自分だけの履歴を読み、不正入力は全体を拒否する', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await expect.poll(() => page.evaluate(() => window.__predictionTools.size)).toBe(2);
	const context = (await page.evaluate(async () =>
		window.__predictionTools.get('get_prediction_context')!.execute({})
	)) as PredictionContext;
	expect(context.race.id).toBe(PREVIEW_RACE_ID);
	expect(context.oddsAsOf).toBe(Date.parse('2099-05-05T05:30:00.000Z'));
	expect(context.entries[0].odds).toMatchObject({
		win: 3.4,
		placeMin: 1.4,
		placeMax: 1.8,
		popularity: 1
	});
	expect(context.entries[0].myHistory.length).toBeGreaterThan(0);
	expect(context.entries[0].pastRuns.length).toBeGreaterThan(0);
	expect(JSON.stringify(context.sameConditionNotes)).toContain(SAME_CONDITION_NOTE_BODY);
	expect(JSON.stringify(context)).not.toContain(OTHER_USER_SAME_CONDITION_BODY);
	await page.locator('[name="raceNoteBody"]').fill('人間の最新見立て');
	const current = (await page.evaluate(async () =>
		window.__predictionTools.get('get_prediction_context')!.execute({})
	)) as PredictionContext;
	expect(current.myCurrentRacePrediction.body).toBe('人間の最新見立て');
	expect(
		await applyPrediction(page, {
			race: { body: '消してはいけない' },
			entries: [{ entryId: WEBMCP_ENTRY_IDS[0], mark: '◎' }]
		})
	).toEqual({ status: 'rejected', reason: 'unknown_entry', entryId: WEBMCP_ENTRY_IDS[0] });
	expect(
		await applyPrediction(page, {
			race: {
				flow: {
					...emptyFlow(),
					start: { spots: [{ entryId: WEBMCP_ENTRY_IDS[0], x: 0, y: 0 }], memo: '' }
				}
			},
			entries: []
		})
	).toMatchObject({ status: 'rejected', reason: 'unknown_entry' });
	expect(
		await applyPrediction(page, { entries: [{ entryId: context.entries[0].entryId, mark: '★' }] })
	).toMatchObject({ status: 'rejected', reason: 'invalid_input' });
	await expect(page.locator('[name="raceNoteBody"]')).toHaveValue('人間の最新見立て');
});

test('SPAの別レース移動で登録を交換し、予想画面を離れると解除する', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await page.evaluate((raceId) => {
		const link = document.createElement('a');
		link.href = `/races/${raceId}/preview`;
		link.textContent = '別レースへ';
		document.querySelector('main')!.append(link);
	}, MARKS_RACE_ID);
	await page.getByRole('link', { name: '別レースへ' }).click();
	await expect
		.poll(async () => {
			return page.evaluate(async () => {
				const tool = window.__predictionTools.get('get_prediction_context');
				return tool ? ((await tool.execute({})) as PredictionContext).race?.id : null;
			});
		})
		.toBe(MARKS_RACE_ID);
	expect(
		await page.evaluate(() =>
			window.__retiredPredictionTools
				.find((tool) => tool.name === 'apply_prediction_draft')!
				.execute({ entries: [] })
		)
	).toMatchObject({ status: 'rejected', reason: 'inactive_page' });
	await page.getByRole('link', { name: '予想をまとめて見る' }).click();
	await expect.poll(() => page.evaluate(() => window.__predictionTools.size)).toBe(0);
});

test('WebMCP非対応でも通常の予想フォームを操作できる', async ({ page }) => {
	await login(page);
	await page.addInitScript(() =>
		Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })
	);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await page.locator('[name="raceNoteBody"]').fill('通常の手入力');
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	await expect(page.getByRole('button', { name: '出走前メモを保存' })).toBeVisible();
});

test('モバイルのAI反映通知は表示中も保存ボタンを覆わない', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	expect(
		await applyPrediction(page, { race: { body: '確認して保存する見立て' }, entries: [] })
	).toMatchObject({ status: 'applied' });
	const save = page.getByRole('button', { name: '出走前メモを保存' });
	await save.scrollIntoViewIfNeeded();
	const notice = page
		.locator('[data-sonner-toast]')
		.filter({ hasText: 'AIの予想を下書きに反映しました' });
	await expect(notice).toBeVisible();
	const noticeBox = await notice.boundingBox();
	const saveBox = await save.boundingBox();
	expect(noticeBox).not.toBeNull();
	expect(saveBox).not.toBeNull();
	expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(saveBox!.y);
});

test('予想から離れるとツールを解除し、戻ると登録し直す', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await expect(page.getByRole('link', { name: 'WebMCPの使い方' })).toHaveCount(0);
	await page.getByRole('link', { name: 'レース', exact: true }).first().click();
	await expect(page).toHaveURL(/\/races(\?.*)?$/);
	await expect.poll(() => page.evaluate(() => window.__predictionTools.size)).toBe(0);
	await page.goBack();
	await expect(page).toHaveURL(new RegExp(`${PREVIEW_RACE_ID}/preview`));
	await expect.poll(() => page.evaluate(() => window.__predictionTools.size)).toBe(2);
	const current = (await page.evaluate(async () =>
		window.__predictionTools.get('get_prediction_context')!.execute({})
	)) as PredictionContext;
	expect(current.race.id).toBe(PREVIEW_RACE_ID);
});

test('MCP の使い方からWebMCPの使い方に行ける', async ({ page }) => {
	await login(page);
	await mockPredictionTools(page);
	await gotoHydrated(page, '/help/mcp');
	const helpLink = page.getByRole('link', { name: 'WebMCPの使い方' });
	const target = await helpLink.boundingBox();
	expect(target).not.toBeNull();
	expect(target!.height).toBeGreaterThanOrEqual(24);
	expect(target!.width).toBeGreaterThanOrEqual(24);
	await helpLink.click();
	await expect(page).toHaveURL('/help/webmcp');
	await expect(page.getByRole('heading', { name: 'WebMCPの使い方', exact: true })).toBeVisible();
	await expect(
		page.getByText('このブラウザには、uma-memoが使うWebMCPの対応APIがあります。')
	).toBeVisible();
});

test('非対応でも使い方が読めて、通常のレース選択に進める', async ({ page }) => {
	await login(page);
	await page.addInitScript(() =>
		Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })
	);
	await gotoHydrated(page, '/help/webmcp');
	await expect(
		page.getByText('このブラウザでは、uma-memoが使うWebMCPの対応APIが見つかりません。')
	).toBeVisible();
	await expect(page.getByRole('heading', { name: '4. 下書きを確認して保存する' })).toBeVisible();
	await page.getByRole('link', { name: 'レースを選ぶ' }).click();
	await expect(page).toHaveURL('/races');
});
