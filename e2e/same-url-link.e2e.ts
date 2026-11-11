import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { ACTUAL_FLOW_18_RACE_ID, MARKS_RACE_ID } from './seed';

/**
 * SvelteKit 3 は、今の URL と同じリンクを押すと `refreshAll()` で load を読み直す（2 は何もしなかった）。
 * 読み直しで書きかけ（未保存の本文）が SSR の値に戻ると、メモが黙って消える。
 * 同じ URL のリンクを足して押し、書きかけが残ることを確かめる。
 */
async function clickSameUrlLink(page: Page) {
	const path = new URL(page.url()).pathname;
	await page.evaluate((href) => {
		const a = document.createElement('a');
		a.href = href;
		a.textContent = '同じ URL';
		a.id = 'same-url-link';
		document.body.append(a);
	}, path);
	// 読み直しが本当に起きたこと（load の __data.json を取りに行く）まで待つ。起きていなければ、この検査は意味がない。
	const reloaded = page.waitForRequest((r) => r.url().includes('__data.json'));
	await page.locator('#same-url-link').click();
	await reloaded;
	await expect(page).toHaveURL(path);
}

for (const [name, path] of [
	['予想', `/races/${MARKS_RACE_ID}/preview`],
	['ふりかえり', `/races/${ACTUAL_FLOW_18_RACE_ID}`]
] as const) {
	test(`${name}の画面で、書きかけのまま同じ URL のリンクを押しても書いたものは残る`, async ({
		page
	}) => {
		await login(page);
		await gotoHydrated(page, path);
		const body = page.locator('textarea[name="raceNoteBody"]');
		await body.fill('同じ URL を押しても消えない。');

		let asked = false;
		page.on('dialog', (d) => {
			asked = true;
			void d.dismiss();
		});
		await clickSameUrlLink(page);
		// 同じ URL は離脱ではないので、離れる前の確認は出さない（出して止めたら読み直しも起きない）。
		expect(asked).toBe(false);

		await expect(body).toHaveValue('同じ URL を押しても消えない。');
	});
}
