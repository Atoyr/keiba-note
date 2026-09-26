import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { FLOW_RACE_ID, MARKS_RACE_ID } from './seed';

/**
 * ★ 展開の予想を盤面に置いて、「まとめて保存」で残せること。
 *
 * 隊列は hidden の欄に JSON で入る。**置いただけで未保存に数えられ**（保存ボタンが出る）、
 * 保存すると読み込み直しても畳んだ1行に出る。本番ビルドで form POST が通ることも一緒に見ている。
 */
test('盤面に馬を置き、ペースとメモを添えて保存すると、読み込み直しても残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${FLOW_RACE_ID}/preview`);

	const flow = page.locator('details', { hasText: '展開の予想' });
	await expect(flow.locator('summary')).toContainText('＋ 書く');
	await flow.locator('summary').click();

	// 右回りなので先頭は左。
	await expect(flow.getByText('← 進行方向')).toBeVisible();

	await flow.getByRole('button', { name: '1番 E2Eニゲウマ', exact: true }).click();
	await flow.getByRole('button', { name: '先頭・内（空き）' }).click();
	await flow.getByRole('button', { name: '2番 E2Eオイコミ', exact: true }).click();
	await flow.getByRole('button', { name: '前から5列目・外（空き）' }).click();
	await flow.getByText('ハイ', { exact: true }).click();
	await flow.getByRole('textbox', { name: 'スタートのメモ' }).fill('①が押してハナ');

	const save = page.getByRole('button', { name: '出走前メモを保存' });
	await expect(save).toBeVisible();
	await save.click();
	await expect(page.locator('[data-sonner-toast]')).toContainText('保存しました');

	await gotoHydrated(page, `/races/${FLOW_RACE_ID}/preview`);
	const summary = page.locator('details', { hasText: '展開の予想' }).locator('summary');
	await expect(summary).toContainText('ハイ');
	await expect(summary).toContainText('スタート ①-②');

	// 予想まとめにも盤面で出る。
	await gotoHydrated(page, `/races/${FLOW_RACE_ID}/summary`);
	const section = page.getByRole('region', { name: '展開の予想' });
	await expect(section.getByRole('group', { name: 'スタートの隊列' })).toBeVisible();
	await expect(section).toContainText('①-②');
	await expect(section).toContainText('①が押してハナ');
});

/** 開催後のふりかえりでは、開催前に置いた展開を畳んで出す（答え合わせに使う）。 */
test('ふりかえりの「開催前の見立て」に展開の予想が畳んで出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}`);

	const flow = page.locator('details', { hasText: '展開の予想' });
	await expect(flow.getByRole('group', { name: '4コーナーの隊列' })).toBeHidden();
	await flow.locator('summary').click();
	await expect(flow.getByRole('group', { name: '4コーナーの隊列' })).toBeVisible();
	await expect(flow).toContainText('②が外から押し上げる');
});
