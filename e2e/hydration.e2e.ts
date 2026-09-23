import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration';
import { login } from './login';
import { PAST_EMPTY_RACE_ID } from './seed';

/**
 * `waitForHydration` が**入力欄の値合わせより後まで待つ**こと。
 *
 * JS の配信を止めて hydration を遅らせ、その間に書いた値が hydration で
 * SSR の値に戻されること＝待たずに書くと消えることを先に見せる。
 * SSR の値は空とは限らない（races.e2e.ts が同じレースに並列で書く）ので、その場で読んで比べる。
 * そのうえで、印が立ってから書いた値は残ることを見る。
 *
 * **保存はしない。** レースのメモは1人・1レースに1行なので、並列で走る
 * races.e2e.ts と同じ行を取り合うことになる。
 */
test('hydration 前に書いた値は消え、印が立ってから書いた値は残る', async ({ page }) => {
	await login(page);

	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await held;
		await route.continue();
	});

	// JS を止めているので load は来ない。DOM ができたところで止める。
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}`, { waitUntil: 'domcontentloaded' });
	const body = page.locator('textarea[name="raceNoteBody"]');
	const rendered = await body.inputValue();
	await body.fill('hydration の前に書いた。');
	await expect(page.locator('html')).not.toHaveAttribute('data-hydrated');

	release();
	await waitForHydration(page);
	// 待たずに書くとこうなる。flaky の正体。
	await expect(body).toHaveValue(rendered);

	await body.fill('hydration のあとに書いた。');
	// 上書きが後から来ないこと。値合わせは印より前に済んでいる。
	await page.waitForTimeout(500);
	await expect(body).toHaveValue('hydration のあとに書いた。');
});
