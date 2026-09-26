import { expect, test } from '@playwright/test';
import { login } from './login';
import { gotoHydrated } from './hydration';
import { NATIVE_SHARE_RACE_ID } from './seed';
import { deviceShareState, mockDeviceShare, type DeviceShareMode } from './native-share';
import { failNextAction } from './action-failure';

const path = `/races/${NATIVE_SHARE_RACE_ID}/summary`;
test.beforeEach(async ({ page }) => {
	await login(page);
	await page.request.post(`${path}?/revoke`, {
		headers: { origin: `http://localhost:${process.env.E2E_PORT ?? 4173}` },
		form: {}
	});
	await gotoHydrated(page, path);
});

for (const mode of ['success', 'cancel', 'retry', 'copy', 'manual'] satisfies DeviceShareMode[]) {
	test(`シェアでリンクを発行し、端末の応答を扱う: ${mode}`, async ({ page }) => {
		await mockDeviceShare(page, mode);
		let postCount = 0;
		page.on('request', (request) => {
			if (request.method() === 'POST' && request.url().includes('?/share')) postCount++;
		});
		const shareButton = page.getByRole('button', { name: '予想をシェア', exact: true });
		await shareButton.focus();
		await page.keyboard.press('Enter');
		const field = page.getByRole('textbox', { name: '共有リンク', exact: true });
		await expect(field).toBeVisible();
		await expect(shareButton).toHaveAttribute('aria-disabled', 'false');
		const url = await field.inputValue();
		const response = await page.request.get(url);
		expect(response.status()).toBe(200);
		expect(await response.text()).toContain('端末共有用の見立て。');
		const state = await deviceShareState(page);
		if (mode === 'success' || mode === 'cancel' || mode === 'retry') {
			expect(state.shared).toEqual([{ title: 'E2E端末共有賞 予想まとめ — uma-memo', url }]);
			expect(state.copied).toEqual([]);
		} else if (mode === 'copy') {
			expect(state.copied).toEqual([url]);
			await expect(
				page.getByText('共有リンクをコピーしました。投稿先に貼り付けてください。')
			).toBeVisible();
		} else {
			await expect(
				page.getByText(
					'共有リンクを用意しました。「リンクをコピー」かリンク欄の選択でコピーしてください。'
				)
			).toBeVisible();
		}
		if (mode === 'cancel') {
			await expect(
				page.getByText('共有画面を閉じました。リンクは共有できる状態です。')
			).toBeVisible();
			await expect(shareButton).toBeFocused();
		}
		if (mode === 'retry') {
			await page.getByRole('button', { name: '投稿先を選ぶ', exact: true }).click();
			await expect(
				page.getByText('共有画面を開きました。リンクは引き続き使えます。')
			).toBeVisible();
			expect((await deviceShareState(page)).shared).toHaveLength(2);
		}
		expect(postCount).toBe(1);
		await page.getByRole('button', { name: '共有をやめる', exact: true }).click();
		await expect(field).toHaveCount(0);
	});
}

test('共有待ちを表示し、連打してもリンク発行と端末共有を繰り返さない', async ({ page }) => {
	await mockDeviceShare(page, 'pending');
	let postCount = 0;
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('?/share')) postCount++;
	});
	await page.getByRole('button', { name: '予想をシェア', exact: true }).click();
	await expect(page.getByRole('textbox', { name: '共有リンク', exact: true })).toBeVisible();
	const pendingButton = page.getByRole('button', { name: '共有リンクを準備中', exact: true });
	await expect(pendingButton).toHaveAttribute('aria-busy', 'true');
	await expect(pendingButton).toHaveAttribute('aria-disabled', 'true');
	await expect(pendingButton.locator('svg.lucide-loader-circle')).toBeVisible();
	// aria-disabledでもEnterが送られた場合に、アプリ側のガードが働くことを確認する。
	await pendingButton.focus();
	await page.keyboard.press('Enter');
	expect((await deviceShareState(page)).shared).toHaveLength(1);
	expect(postCount).toBe(1);
});

test('発行失敗時は端末共有を開かず、同じボタンから再試行できる', async ({ page }) => {
	await mockDeviceShare(page, 'success');
	await failNextAction(page, path, {
		failed: true,
		message: '共有内容の保存を確認できませんでした。時間をおいてもう一度お試しください。'
	});
	await page.getByRole('button', { name: '予想をシェア', exact: true }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(page.getByRole('textbox', { name: '共有リンク', exact: true })).toHaveCount(0);
	expect((await deviceShareState(page)).shared).toEqual([]);
	await page.getByRole('button', { name: '予想をシェア', exact: true }).click();
	await expect(page.getByRole('textbox', { name: '共有リンク', exact: true })).toBeVisible();
	expect((await deviceShareState(page)).shared).toHaveLength(1);
});
