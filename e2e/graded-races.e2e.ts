import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import { raceMenuItem } from './race-menu';
import { GRADED_RACE, PROFILE_RACE, REVIEW_RACE_ID, TREND_RACE } from './seed';
import { expectLinkTo } from './link';

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
	await expectLinkTo(
		rows.first().getByRole('link'),
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
	await expectLinkTo(
		last.getByRole('link', { name: /産経賞オールカマー/ }),
		`/races/${GRADED_RACE.lastYearRaceId}`
	);

	// 1頭ごとのメモは本文を出さず、数だけをレースへのリンクにする（印を付けた出走前メモが2件）。
	await expectLinkTo(
		last.getByRole('link', { name: '1頭ごとのメモ 2件' }),
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
	// 欄そのものも閉じている。
	await expect(trendRegion(page).locator('details')).toHaveJSProperty('open', false);
	await expect(page.getByLabel('傾向の本文')).toBeHidden();

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
	// ふりかえり画面: レース名（見出し）を押してメニューを開く。
	await page.goto(`/races/${GRADED_RACE.lastYearRaceId}`);
	await waitForHydration(page);
	const title = page.getByRole('heading', { level: 1 }).getByRole('button');
	await title.click();
	await expect(page.getByRole('menu')).toBeVisible();
	// もう一度押すと閉じる（開いている間は body が pointer-events: none なので、座標で押す）。
	const box = (await title.boundingBox())!;
	await page.mouse.click(box.x + 4, box.y + box.height / 2);
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(title).toHaveAttribute('aria-expanded', 'false');
	await title.click();
	await expect(page.getByRole('menu')).toBeVisible();
	await page.getByRole('menuitem', { name: '重賞のタイムライン' }).click();
	await expect(page).toHaveURL(gradedPath(GRADED_RACE.key));

	// 予想画面: 右端の ⋯ から。
	await page.goto(`/races/${GRADED_RACE.thisYearRaceId}/preview`);
	await expectLinkTo(await raceMenuItem(page, '重賞のタイムライン'), gradedPath(GRADED_RACE.key));
});

test('重賞に当たらない名前は 404 で、傾向も書けない', async ({ page }) => {
	await login(page);
	// G1〜G3 のレースが1つも無い名前（条件戦の名前でも、存在しない名前でも同じ）。
	const path = gradedPath('E2E特別');

	const res = await page.goto(path);
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: '重賞が見つかりません' })).toBeVisible();
	await expectLinkTo(page.getByRole('link', { name: '重賞の一覧で探す' }), '/graded-races');

	const post = await page.request.post(`${path}?/saveTrend`, {
		headers: { origin: `http://localhost:${process.env.E2E_PORT ?? 4173}` },
		form: { body: '書けてはいけない' }
	});
	expect(post.status()).toBe(404);
});

test('本人の毎年共通の重賞の傾向はレース情報に集約し、入力側に重ねない', async ({ page }) => {
	await login(page);
	for (const path of [`/races/${TREND_RACE.raceId}/preview`, `/races/${TREND_RACE.raceId}`]) {
		await gotoHydrated(page, path);
		await expect(page.getByText(TREND_RACE.trend)).toBeHidden();
		await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
		const trend = page.getByRole('region', { name: '重賞の傾向' });
		await expect(trend).toContainText(TREND_RACE.trend);
		await expect(trend).toContainText(`${TREND_RACE.key}・毎年共通`);
		await expectLinkTo(
			trend.getByRole('link', { name: '重賞の画面で直す' }),
			gradedPath(TREND_RACE.key)
		);
		await expect(page.getByText(TREND_RACE.otherUserTrend)).toHaveCount(0);
		// 重賞のタイムラインは傾向の下。重賞の画面へのリンクが見出しの行にある。
		const timeline = page.getByRole('region', { name: /重賞のタイムライン/ });
		await expectLinkTo(
			timeline.getByRole('link', { name: '重賞の画面で見る' }),
			gradedPath(TREND_RACE.key)
		);
		// TREND_RACE はほかの年が無い（このレース自身の行はタイムラインに出さない）。
		await expect(timeline).toContainText('ほかの年のこのレースは、まだ登録されていません。');
	}
});

test('レース情報タブの重賞のタイムラインに、ほかの年の見立て・ふりかえり・印が並ぶ', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${GRADED_RACE.thisYearRaceId}/preview`);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();

	const timeline = page.getByRole('region', { name: /重賞のタイムライン/ });
	// 去年（別名）と一昨年の2行。このレース自身（今年）の行は出さない。
	const rows = timeline.locator('ol > li');
	await expect(rows).toHaveCount(2);
	await expect(
		timeline.locator(`a[href="/races/${GRADED_RACE.thisYearRaceId}/preview"]`)
	).toHaveCount(0);

	const last = rows.filter({ hasText: GRADED_RACE.aliasName });
	await expect(last).toHaveCount(1);
	await expect(last).toContainText(GRADED_RACE.outlook);
	await expect(last).toContainText(GRADED_RACE.review);
	await expect(last).toContainText(`勝ち馬 ${GRADED_RACE.winner}`);
	await expect(last.locator('ul > li')).toHaveText([/E2E重賞イチバン.*1着/, /E2E重賞ニバン.*4着/]);
	await expect(rows.filter({ hasText: 'メモはありません' })).toHaveCount(1);
	await expectLinkTo(
		timeline.getByRole('link', { name: '重賞の画面で見る' }),
		gradedPath(GRADED_RACE.key)
	);

	// 1頭ごとのメモの本文と、他人のメモ・傾向は出ない。
	await expect(timeline.getByText(GRADED_RACE.horseNoteBody)).toHaveCount(0);
	await expect(page.getByText(GRADED_RACE.otherUserOutlook)).toHaveCount(0);
	await expect(page.getByText(GRADED_RACE.otherUserTrend)).toHaveCount(0);

	// タイムラインに出た去年のふりかえりは、同じ条件のレースメモ（中山 芝2200m）に重ねて出さない。
	const same = page.getByRole('region', { name: /同じ条件で書いたレースのメモ/ });
	await expect(same).toBeVisible();
	await expect(same).not.toContainText(GRADED_RACE.review);
});

test('傾向を書いていない重賞のふりかえり画面のレース情報には、書いていない案内が出る', async ({
	page
}) => {
	await login(page);
	// REVIEW_RACE_ID は G3 だが、誰も傾向を書かない。
	await gotoHydrated(page, `/races/${REVIEW_RACE_ID}`);

	await expect(
		page.getByRole('heading', { name: 'レースのメモ', level: 2, exact: true })
	).toBeVisible();
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	const trend = page.getByRole('region', { name: '重賞の傾向' });
	await expect(trend).toContainText('まだ傾向のメモはありません。');
	await expect(trend.getByRole('link', { name: '重賞の画面で書く' })).toBeVisible();
});

/**
 * JS が無いと、失敗した保存の画面は描き直される。そのとき書いた欄を閉じて返すと、
 * 失敗のメッセージも入力も見えない。開いたまま返す（`<details open>` の枝）。
 * 保存は失敗するので、DB は変わらない。
 */
test.describe('JavaScript が無いとき', () => {
	test.use({ javaScriptEnabled: false });

	test('傾向の保存に失敗した画面は、欄が開いたまま入力も残る', async ({ page }) => {
		await login(page);
		await page.goto(gradedPath(GRADED_RACE.key));

		const tooLong = 'あ'.repeat(10001);
		const details = trendRegion(page).locator('details');
		await details.locator('summary').click();
		await page.getByLabel('傾向の本文').fill(tooLong);
		await page.getByRole('button', { name: '傾向を保存する' }).click();

		await expect(
			page.getByRole('alert').filter({ hasText: '10,000文字以内にしてください' })
		).toBeVisible();
		await expect(details).toHaveJSProperty('open', true);
		await expect(page.getByLabel('傾向の本文')).toHaveValue(tooLong);
	});
});

test('表に紹介のある重賞のレース情報に、条件・優先出走権・前哨戦・コースの特徴が出る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${PROFILE_RACE.raceId}/preview`);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();

	const conditions = page.getByRole('region', { name: 'レースの条件と前哨戦' });
	await expect(conditions).toContainText('3歳以上オープン 定量');
	await expect(conditions).toContainText('オールカマー・毎日王冠・京都大賞典の1着馬');
	// 去年のオールカマー（別名）が窓に入る。勝ち馬と優先出走権の札つきで、ふりかえりへ行ける。
	const step = conditions
		.locator('li', { hasText: `${GRADED_RACE.key}` })
		.filter({ hasText: '勝ち馬' });
	await expect(step).toContainText(`勝ち馬 ${GRADED_RACE.winner}`);
	await expect(step).toContainText('優先出走権 1着');
	await expectLinkTo(
		step.getByRole('link', { name: GRADED_RACE.key, exact: true }),
		`/races/${GRADED_RACE.lastYearRaceId}`
	);
	// 窓に無いステップは未登録。
	await expect(conditions.locator('li', { hasText: '札幌記念' })).toContainText('未登録');

	const course = page.getByRole('region', { name: /コースの特徴/ });
	for (const label of ['スタート', '道中', 'ゴール前', '展開と傾向']) {
		await expect(course.getByText(label, { exact: true })).toBeVisible();
	}
});

test('表に紹介の無い重賞のレース情報には、レースの条件もコースの特徴も出ない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${GRADED_RACE.thisYearRaceId}/preview`);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();

	await expect(page.getByRole('region', { name: /重賞のタイムライン/ })).toBeVisible();
	await expect(page.getByText('レースの条件と前哨戦')).toHaveCount(0);
	await expect(page.getByText('コースの特徴')).toHaveCount(0);
});
