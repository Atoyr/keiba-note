import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { FLOW_CROWD_RACE_ID, FLOW_RACE_ID, MARKS_RACE_ID } from './seed';

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

	// 予想まとめでは畳んで出し、閉じた行に隊列の1行、開くと盤面。
	await gotoHydrated(page, `/races/${FLOW_RACE_ID}/summary`);
	const section = page.getByRole('region', { name: '展開の予想' });
	await expect(section.locator('summary')).toContainText('スタート ①-②');
	await expect(section.getByRole('group', { name: 'スタートの隊列' })).toBeHidden();
	await section.locator('summary').click();
	await expect(section.getByRole('group', { name: 'スタートの隊列' })).toBeVisible();
	await expect(section).toContainText('①が押してハナ');
});

/**
 * 隊列は hidden の欄なので、下書きから「復元する」で戻したときに盤面を読み直す必要がある
 * （DraftKeeper が欄に change を投げ、RaceFlowEditor がそれを聞く）。
 */
test('置いたまま保存せずに読み込み直しても、下書きの復元で盤面が戻る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${FLOW_CROWD_RACE_ID}/preview`);

	const flow = page.locator('details', { hasText: '展開の予想' });
	await flow.locator('summary').click();
	await flow.getByRole('tab', { name: /ゴール前/ }).click();
	// seed ではゴール前にも18頭を置いてあるので、消してから1頭だけ置く。
	await flow.getByRole('button', { name: '並びを消す' }).click();
	await flow.getByRole('button', { name: 'ツバサ', exact: true }).click();
	await flow.getByRole('button', { name: '先頭・大外（空き）' }).click();
	await expect(page.getByRole('button', { name: '出走前メモを保存' })).toBeVisible();
	// 下書きは入力から少し遅れて書く（DraftKeeper）。書かれるまで待つ。
	await expect
		.poll(() =>
			page.evaluate(() =>
				Object.keys(localStorage).some((k) => k.startsWith('uma-memo:draft:preview:'))
			)
		)
		.toBe(true);

	page.once('dialog', (d) => void d.accept());
	await gotoHydrated(page, `/races/${FLOW_CROWD_RACE_ID}/preview`);
	const summary = page.locator('details', { hasText: '展開の予想' }).locator('summary');
	await expect(summary).toContainText('ゴール前 アカ･サク-');

	await page.getByRole('button', { name: '復元する' }).click();
	await expect(summary).toContainText('ゴール前 ツバ');
});

/** キーボードでは盤面を1つの止まり場所にし、矢印キーでマスを動く。 */
test('盤面は Tab で1回止まり、矢印キーでマスを移って置ける', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${FLOW_RACE_ID}/preview`);

	const flow = page.locator('details', { hasText: '展開の予想' });
	await flow.locator('summary').click();
	// スタートは上の保存のテストが並行して埋めるので、触らないゴール前で確かめる。
	await flow.getByRole('tab', { name: /ゴール前/ }).click();
	await flow.getByRole('button', { name: '2番 E2Eオイコミ', exact: true }).click();

	const board = flow.getByRole('group', { name: /ゴール前の隊列/ });
	await expect(board.locator('button[tabindex="0"]')).toHaveCount(1);
	await board.getByRole('button', { name: '先頭・内（空き）' }).focus();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowRight');
	await expect(board.getByRole('button', { name: '前から2列目・中（空き）' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(
		board.getByRole('button', { name: '2番 E2Eオイコミ（前から2列目・中）' })
	).toBeVisible();
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
