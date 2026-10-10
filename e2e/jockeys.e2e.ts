import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import {
	JOCKEYS,
	OTHER_USER_PREVIEW_BODY,
	PREVIEW_RACE_ID,
	REVIEW_RACE_ID,
	THIS_WEEK_RACES,
	TIMELINE_RUN_RACES
} from './seed';

const jockeyPath = (name: string) => `/jockeys/${encodeURIComponent(name)}`;
const rides = 'main section ol > li';
// まとめの文。入力欄（閉じた details の中）にも同じ文があるので、先に出る読む形を見る。
const summaryRegion = (page: Page) => page.getByRole('region', { name: 'まとめ' });

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
	await expect(summaryRegion(page).getByText(JOCKEYS.mainSummary).first()).toBeVisible();

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
	// 入力欄が閉じたら、フォーカスは開閉のボタンに戻る（押した保存ボタンは閉じた中に消える）。
	await expect(summaryRegion(page).locator('summary')).toBeFocused();

	// 読み込み直しても残る。一覧にも札が出る。
	await page.reload();
	await expect(summaryRegion(page).getByText('若手らしく積極的。').first()).toBeVisible();
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

// 出走馬の行の騎手名に hover・フォーカスすると、自分のまとめを浮かべる。
for (const [label, path] of [
	['予想画面', `/races/${PREVIEW_RACE_ID}/preview`],
	['ふりかえり画面', `/races/${REVIEW_RACE_ID}`]
] as const) {
	test(`${label}の騎手名に hover すると、自分のまとめが浮かぶ（他人のまとめは出ない）`, async ({
		page
	}) => {
		await login(page);
		await gotoHydrated(page, path);

		const link = page.getByRole('link', { name: JOCKEYS.main }).first();
		await link.hover();

		const tooltip = page.getByRole('tooltip');
		await expect(tooltip).toContainText(JOCKEYS.mainSummary);
		await expect(tooltip).toContainText('中山巧者');
		await expect(page.getByText(JOCKEYS.otherUserSummary)).toHaveCount(0);
		// リンクのまま（ボタンにはならない）で、開いている間は説明として結ばれる。
		await expect(link).toHaveAttribute('aria-describedby', /.+/);
		await expect(link).not.toHaveAttribute('aria-haspopup', /.*/);

		// クリックでの遷移は変わらない。
		await link.click();
		await expect(page.getByRole('heading', { name: JOCKEYS.main, level: 1 })).toBeVisible();
	});
}

test('予想画面の騎手名にキーボードでフォーカスしても、まとめが浮かんで Esc で閉じる', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	// 実際に Tab で辿り着く（focus() だけでは focus-visible にならず、ツールチップは開かない）。
	const link = page.getByRole('link', { name: JOCKEYS.main }).first();
	for (let i = 0; i < 100; i++) {
		if (await link.evaluate((el) => el === document.activeElement)) break;
		await page.keyboard.press('Tab');
	}
	await expect(link).toBeFocused();

	await expect(page.getByRole('tooltip')).toContainText(JOCKEYS.mainSummary);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('まとめの無い騎手の名前に hover しても何も浮かばない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${THIS_WEEK_RACES.upcoming.id}/preview`);

	// 同じレースの E2E騎手（まとめあり）には出る。ワカテ騎手には出ない。
	await page.getByRole('link', { name: JOCKEYS.rookie }).hover();
	// 浮かぶ遅延（300ms）より長く待つ。
	await page.waitForTimeout(800);
	await expect(page.getByRole('tooltip')).toHaveCount(0);

	await page.getByRole('link', { name: JOCKEYS.main }).first().hover();
	await expect(page.getByRole('tooltip')).toContainText(JOCKEYS.mainSummary);
});

// hover できない端末（スマホ・タブレット）。Chromium は hasTouch で `(hover: none)` になる。
// まとめのある騎手名は button になり、タップで Popover を開く。騎手の画面へは中のリンクで行く。
test.describe('hover できない端末', () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

	test('予想画面の騎手名をタップすると、自分のまとめが開き、中のリンクから騎手の画面へ行ける', async ({
		page
	}) => {
		await login(page);
		await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

		await page.getByRole('button', { name: JOCKEYS.main }).first().tap();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText(JOCKEYS.mainSummary);
		await expect(dialog).toContainText('中山巧者');
		await expect(page.getByText(JOCKEYS.otherUserSummary)).toHaveCount(0);

		await dialog.getByRole('link', { name: '騎手の画面へ' }).tap();
		await expect(page.getByRole('heading', { name: JOCKEYS.main, level: 1 })).toBeVisible();
	});

	test('まとめの無い騎手はリンクのままで、タップで騎手の画面へ行く', async ({ page }) => {
		await login(page);
		await gotoHydrated(page, `/races/${THIS_WEEK_RACES.upcoming.id}/preview`);

		await expect(page.getByRole('button', { name: JOCKEYS.rookie })).toHaveCount(0);
		await page.getByRole('link', { name: JOCKEYS.rookie }).tap();
		await expect(page.getByRole('heading', { name: JOCKEYS.rookie, level: 1 })).toBeVisible();
	});
});

test('騎乗の無い騎手は 404 で、まとめも書けない', async ({ page }) => {
	await login(page);
	const path = jockeyPath('いない騎手');

	const res = await page.goto(path);
	expect(res?.status()).toBe(404);
	// 既定のエラー画面ではなく、一覧へ戻る道を出す（名前の表記が変わるとリンクが古くなる）。
	await expect(page.getByRole('heading', { name: '騎手が見つかりません' })).toBeVisible();
	await expect(page.getByRole('link', { name: '騎手の一覧で探す' })).toHaveAttribute(
		'href',
		'/jockeys'
	);

	const post = await page.request.post(`${path}?/saveSummary`, {
		headers: { origin: `http://localhost:${process.env.E2E_PORT ?? 4173}` },
		form: { body: '書けてはいけない' }
	});
	expect(post.status()).toBe(404);
});
