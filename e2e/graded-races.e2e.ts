import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { login } from './login';
import { GRADED_RACE, REVIEW_RACE_ID, TREND_RACE } from './seed';

const gradedPath = (name: string) => `/graded-races/${encodeURIComponent(name)}`;
// 傾向の文。入力欄（閉じた details の中）にも同じ文があるので、先に出る読む形を見る。
const trendRegion = (page: Page) => page.getByRole('region', { name: '傾向' });
const years = 'main section[aria-labelledby="graded-years"] ol > li';

test('重賞の一覧に今年の重賞が出て、重賞の画面を開ける', async ({ page }) => {
	await login(page);
	await page.goto('/graded-races');

	await expect(page.getByRole('heading', { name: '重賞', level: 1 })).toBeVisible();
	const row = page.locator('main ul > li', { hasText: GRADED_RACE.key });
	await expect(row).toHaveCount(1);
	// 去年のメモがあるので「メモ 1年」。
	await expect(row).toContainText('メモ 1年');
	await row.getByRole('link').click();
	await expect(page).toHaveURL(gradedPath(GRADED_RACE.key));
	await expect(page.getByRole('heading', { name: GRADED_RACE.key, level: 1 })).toBeVisible();
});

test('年ごとに、別名のレースも同じ重賞として自分の予想とふりかえりが並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(gradedPath(GRADED_RACE.key));

	// 今年（開催予定）・去年（別名）・一昨年（メモなし）の3年。年の降順。
	const rows = page.locator(years);
	await expect(rows).toHaveCount(3);
	await expect(rows.first()).toContainText('開催予定');
	await expect(rows.first().getByRole('link')).toHaveAttribute(
		'href',
		`/races/${GRADED_RACE.thisYearRaceId}/preview`
	);

	const last = rows.filter({ hasText: GRADED_RACE.aliasName });
	await expect(last).toHaveCount(1);
	await expect(last).toContainText(GRADED_RACE.outlook);
	await expect(last).toContainText('ペース スロー');
	await expect(last).toContainText(GRADED_RACE.review);
	await expect(last).toContainText(`勝ち馬 ${GRADED_RACE.winner}`);
	// 印は印の順（◎ → ▲）。着順も出る。
	await expect(last.locator('ul > li')).toHaveText([/E2E重賞イチバン.*1着/, /E2E重賞ニバン.*4着/]);
	await expect(last.getByRole('link', { name: /産経賞オールカマー/ })).toHaveAttribute(
		'href',
		`/races/${GRADED_RACE.lastYearRaceId}`
	);

	// 1頭ごとのメモは本文を出さず、数だけをレースへのリンクにする（印を付けた出走前メモが2件）。
	await expect(last.getByRole('link', { name: '1頭ごとのメモ 2件' })).toHaveAttribute(
		'href',
		`/races/${GRADED_RACE.lastYearRaceId}`
	);

	// メモの無い年（今年・一昨年）は「メモはありません」。
	await expect(rows.filter({ hasText: 'メモはありません' })).toHaveCount(2);

	// 1頭ごとのメモの本文と、他人のメモ・傾向は出ない。
	await expect(page.getByText(GRADED_RACE.horseNoteBody)).toHaveCount(0);
	await expect(page.getByText(GRADED_RACE.otherUserOutlook)).toHaveCount(0);
	await expect(page.getByText(GRADED_RACE.otherUserTrend)).toHaveCount(0);
});

test('傾向を書いて保存でき、空にして保存すると消える', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, gradedPath(GRADED_RACE.key));

	await expect(page.getByText('まだ傾向のメモはありません。')).toBeVisible();
	await page.getByText('＋ 傾向を書く').click();
	await page.getByLabel('傾向の本文').fill('内枠の先行馬が残る年が多い。');
	await page.getByRole('button', { name: '傾向を保存する' }).click();
	await expect(page.getByText('傾向を保存しました')).toBeVisible();
	// 入力欄が閉じたら、フォーカスは開閉のボタンに戻る。
	await expect(trendRegion(page).locator('summary')).toBeFocused();

	// 読み込み直しても残る。一覧にも「傾向」が出る。
	await page.reload();
	await expect(trendRegion(page).getByText('内枠の先行馬が残る年が多い。').first()).toBeVisible();
	await page.goto('/graded-races');
	await expect(page.locator('main ul > li', { hasText: GRADED_RACE.key })).toContainText('傾向');

	await gotoHydrated(page, gradedPath(GRADED_RACE.key));
	await page.getByText('書き直す').click();
	await page.getByLabel('傾向の本文').fill('');
	await page.getByRole('button', { name: '傾向を保存する' }).click();
	await expect(page.getByText('傾向を消しました')).toBeVisible();
	await page.reload();
	await expect(page.getByText('まだ傾向のメモはありません。')).toBeVisible();
});

test('予想画面とふりかえり画面から重賞のタイムラインへ行ける', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${GRADED_RACE.lastYearRaceId}`);

	await page.getByRole('link', { name: '重賞のタイムライン' }).click();
	await expect(page).toHaveURL(gradedPath(GRADED_RACE.key));

	await page.goto(`/races/${GRADED_RACE.thisYearRaceId}/preview`);
	await expect(page.getByRole('link', { name: '重賞のタイムライン' })).toHaveAttribute(
		'href',
		gradedPath(GRADED_RACE.key)
	);
});

test('重賞に当たらない名前は 404 で、傾向も書けない', async ({ page }) => {
	await login(page);
	// G1〜G3 のレースが1つも無い名前（条件戦の名前でも、存在しない名前でも同じ）。
	const path = gradedPath('E2E特別');

	const res = await page.goto(path);
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: '重賞が見つかりません' })).toBeVisible();
	await expect(page.getByRole('link', { name: '重賞の一覧で探す' })).toHaveAttribute(
		'href',
		'/graded-races'
	);

	const post = await page.request.post(`${path}?/saveTrend`, {
		headers: { origin: `http://localhost:${process.env.E2E_PORT ?? 4173}` },
		form: { body: '書けてはいけない' }
	});
	expect(post.status()).toBe(404);
});

test('重賞の傾向が、予想画面は見立ての上・ふりかえり画面はレースのメモの上に読むだけで出る', async ({
	page
}) => {
	await login(page);

	// 予想画面。
	await page.goto(`/races/${TREND_RACE.raceId}/preview`);
	const onPreview = page.getByRole('region', { name: '重賞の傾向' });
	await expect(onPreview).toContainText(TREND_RACE.trend);
	await expect(onPreview).toContainText(`${TREND_RACE.key}・毎年共通`);
	await expect(onPreview.getByRole('link', { name: '重賞の画面で直す' })).toHaveAttribute(
		'href',
		gradedPath(TREND_RACE.key)
	);
	// 他人の傾向は出ない。
	await expect(page.getByText(TREND_RACE.otherUserTrend)).toHaveCount(0);
	const previewTrendBox = await onPreview.boundingBox();
	const outlookBox = await page
		.getByRole('heading', { name: 'レースの見立て', level: 2 })
		.boundingBox();
	expect(previewTrendBox!.y).toBeLessThan(outlookBox!.y);

	// ふりかえり画面。
	await page.goto(`/races/${TREND_RACE.raceId}`);
	const onReview = page.getByRole('region', { name: '重賞の傾向' });
	await expect(onReview).toContainText(TREND_RACE.trend);
	await expect(onReview).toContainText(`${TREND_RACE.key}・毎年共通`);
	await expect(onReview.getByRole('link', { name: '重賞の画面で直す' })).toHaveAttribute(
		'href',
		gradedPath(TREND_RACE.key)
	);
	await expect(page.getByText(TREND_RACE.otherUserTrend)).toHaveCount(0);
	const reviewTrendBox = await onReview.boundingBox();
	const memoBox = await page.getByRole('heading', { name: 'レースのメモ', level: 2 }).boundingBox();
	expect(reviewTrendBox!.y).toBeLessThan(memoBox!.y);
});

test('傾向を書いていない重賞のふりかえり画面には、重賞の傾向の欄が出ない', async ({ page }) => {
	await login(page);
	// REVIEW_RACE_ID は G3 だが、誰も傾向を書かない。
	await page.goto(`/races/${REVIEW_RACE_ID}`);

	await expect(page.getByRole('heading', { name: 'レースのメモ', level: 2 })).toBeVisible();
	await expect(page.getByRole('region', { name: '重賞の傾向' })).toHaveCount(0);
});
