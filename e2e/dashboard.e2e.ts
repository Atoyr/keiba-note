import { expect, test, type Page } from '@playwright/test';
import { login } from './login';
import { DASHBOARD_RACES } from './seed';

/** 見出しの文字で枠を選ぶ。並び順ではなく**どの枠に出るか**を見たいので。 */
const section = (page: Page, heading: string) =>
	page.locator('main section').filter({ has: page.getByRole('heading', { name: heading }) });

test('ダッシュボードは今週、過去、メモの順に表示する', async ({ page }) => {
	await login(page);
	await page.goto('/');

	await expect(page.locator('main h2')).toHaveText(['今週のレース', '過去のレース', '最近のメモ']);
});

test('今週のレースと過去のレースが別々の枠に出る', async ({ page }) => {
	await login(page);
	await page.goto('/');

	const thisWeek = section(page, '今週のレース');
	const past = section(page, '過去のレース');

	// 今日のレースは「今週」に出て、「過去」には出ない。
	await expect(thisWeek.getByText(DASHBOARD_RACES.thisWeek)).toBeVisible();
	await expect(past.getByText(DASHBOARD_RACES.thisWeek)).toHaveCount(0);

	// 10日前のレースは「過去」に出て、「今週」には出ない。
	await expect(past.getByText(DASHBOARD_RACES.inWindow)).toBeVisible();
	await expect(thisWeek.getByText(DASHBOARD_RACES.inWindow)).toHaveCount(0);
});

/** 窓は3週で切る。ここが効かないと「過去のレース」が全履歴になる。 */
test('3週より古いレースはどちらの枠にも出ない', async ({ page }) => {
	await login(page);
	await page.goto('/');

	await expect(page.getByText(DASHBOARD_RACES.outOfWindow)).toHaveCount(0);
});

/**
 * 先に枠だけ登録した重賞（seed の 2099 年のレース）が**レースの枠**に紛れないこと。
 * これを混ぜていたせいで、今週の開催が見えなくなっていた。
 *
 * 「最近のメモ」には出てよい（そのレースに出走前メモを書いてあるので、
 * 書いたものが消えるほうがおかしい）。だから枠の中だけを見る。
 */
test('先の予定はレースの枠には出ない', async ({ page }) => {
	await login(page);
	await page.goto('/');

	for (const heading of ['今週のレース', '過去のレース']) {
		await expect(section(page, heading).getByText('E2E未来賞')).toHaveCount(0);
		await expect(section(page, heading).getByText('E2E予想賞')).toHaveCount(0);
	}
});

test('未ログインではダッシュボードを開けない', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveURL(/\/login/);
	// 今週のレースの中身が漏れていないこと。
	await expect(page.getByText(DASHBOARD_RACES.thisWeek)).toHaveCount(0);
});
