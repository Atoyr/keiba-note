import { expect, test } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	JOCKEYS,
	OTHER_USER_PREVIEW_BODY,
	PREVIEW_RACE_ID,
	REVIEW_RACE_ID,
	TIMELINE_RUN_RACES
} from './seed';

const jockeyPath = (name: string) => `/jockeys/${encodeURIComponent(name)}`;
const rides = 'main section ol > li';

test('騎手の一覧は騎乗の多い順に並び、名前と自分が付けた札で絞れる', async ({ page }) => {
	await login(page);
	await page.goto('/jockeys');

	const names = page.locator('main ul > li .font-medium');
	await expect(names).toHaveText([JOCKEYS.main, JOCKEYS.rookie]);
	// 札は自分が付けたものだけ（別のユーザーが付けた「東京巧者」は出ない）。
	const main = page.locator('main ul > li', { hasText: JOCKEYS.main });
	await expect(main).toContainText('中山巧者');
	await expect(page.getByText('東京巧者')).toHaveCount(0);

	await page
		.getByRole('navigation', { name: '札で絞る' })
		.getByRole('link', { name: '中山巧者' })
		.click();
	await expect(names).toHaveText([JOCKEYS.main]);

	await page.goto('/jockeys');
	await page.getByLabel('騎手名').fill('ワカテ');
	await page.getByRole('button', { name: '検索する' }).click();
	await expect(names).toHaveText([JOCKEYS.rookie]);
});

test('騎手の画面に、まとめと騎乗ごとの自分のメモが並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(jockeyPath(JOCKEYS.main));

	await expect(page.getByRole('heading', { name: JOCKEYS.main, level: 1 })).toBeVisible();
	await expect(page.locator('summary').getByText(JOCKEYS.mainSummary)).toBeVisible();

	// 先頭は出走予定。以降は日付の降順。
	const rows = page.locator(rides);
	await expect(rows.first()).toContainText('出走予定');
	const dates = (await rows.allInnerTexts()).map((t) => t.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');
	expect(dates).toEqual([...dates].sort().reverse());

	// メモはその騎乗の下に出る。馬名は馬の画面へ、レースは結果の有無で振り分ける。
	const noted = rows.filter({ hasText: '直線だけの競馬になった。' });
	await expect(noted).toContainText('E2Eテストホース');
	await expect(noted.getByRole('link', { name: /E2Eステークス/ })).toHaveAttribute(
		'href',
		`/races/${REVIEW_RACE_ID}`
	);
	// メモの無い騎乗も並ぶ。
	await expect(rows.filter({ hasText: 'E2E特別' })).toHaveCount(1);
	await expect(
		rows.filter({ hasText: 'E2E未来賞' }).getByRole('link', { name: /E2E未来賞/ })
	).toHaveAttribute('href', `/races/${TIMELINE_RUN_RACES.future}/preview`);

	// 他人のメモとまとめは出ない。
	await expect(page.getByText(OTHER_USER_PREVIEW_BODY)).toHaveCount(0);
	await expect(page.getByText(JOCKEYS.otherUserSummary)).toHaveCount(0);
});

test('メモのある騎乗だけに絞れる', async ({ page }) => {
	await login(page);
	await page.goto(jockeyPath(JOCKEYS.main));

	await page.getByRole('link', { name: /^メモのある騎乗/ }).click();
	await expect(page).toHaveURL(`${jockeyPath(JOCKEYS.main)}?notes=1`);
	await expect(page.locator(rides).filter({ hasText: '直線だけの競馬になった。' })).toHaveCount(1);
	await expect(page.locator(rides).filter({ hasText: 'E2E特別' })).toHaveCount(0);
});

test('まとめを書いて札を付け、空にすると消える', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, jockeyPath(JOCKEYS.rookie));

	await expect(page.getByText('まだまとめはありません。')).toBeVisible();
	await page.getByText('＋ まとめを書く').click();
	await page.getByLabel('まとめの本文').fill('若手らしく積極的。');
	await page.getByRole('group', { name: '得意な場' }).getByText('福島巧者').click();
	await page.getByRole('button', { name: 'まとめを保存する' }).click();
	await expect(page.getByText('まとめを保存しました')).toBeVisible();

	// 読み込み直しても残る。一覧にも札が出る。
	await page.reload();
	await expect(page.locator('summary').getByText('若手らしく積極的。')).toBeVisible();
	await page.goto('/jockeys');
	await expect(page.locator('main ul > li', { hasText: JOCKEYS.rookie })).toContainText('福島巧者');

	await gotoHydrated(page, jockeyPath(JOCKEYS.rookie));
	await page.getByText('書き直す').click();
	await page.getByLabel('まとめの本文').fill('');
	await page.getByRole('group', { name: '得意な場' }).getByText('福島巧者').click();
	await page.getByRole('button', { name: 'まとめを保存する' }).click();
	await expect(page.getByText('まとめを消しました')).toBeVisible();
	await page.reload();
	await expect(page.getByText('まだまとめはありません。')).toBeVisible();
});

test('予想画面の騎手名から騎手の画面へ行ける', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await page.getByRole('link', { name: JOCKEYS.main }).first().click();
	await expect(page.getByRole('heading', { name: JOCKEYS.main, level: 1 })).toBeVisible();
});

test('騎乗の無い騎手は 404 で、まとめも書けない', async ({ page }) => {
	await login(page);
	const path = jockeyPath('いない騎手');

	const res = await page.goto(path);
	expect(res?.status()).toBe(404);

	const post = await page.request.post(`${path}?/saveSummary`, {
		headers: { origin: `http://localhost:${process.env.E2E_PORT ?? 4173}` },
		form: { body: '書けてはいけない' }
	});
	expect(post.status()).toBe(404);
});
