import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import { raceMenuItem } from './race-menu';
import { GRADED_PLACERS, GRADED_RACE, PROFILE_RACE, REVIEW_RACE_ID, TREND_RACE } from './seed';
import { expectLinkTo } from './link';

const gradedPath = (name: string) => `/graded-races/${encodeURIComponent(name)}`;
// 傾向の文。入力欄（閉じた details の中）にも同じ文があるので、先に出る読む形を見る。
const trendRegion = (page: Page) => page.getByRole('region', { name: '傾向' });
// seed を流した年（今年。JST）。見出しのレースの年。
const jstYear = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Tokyo',
	year: 'numeric'
}).format(new Date());
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

	// 今年（開催予定）・去年（別名）・一昨年・3年前（メモなし）の4年。年の降順。
	const rows = page.locator(years);
	await expect(rows).toHaveCount(4);
	await expect(rows.first()).toContainText('開催予定');
	await expectLinkTo(
		rows.first().getByRole('link'),
		`/races/${GRADED_RACE.thisYearRaceId}/preview`
	);

	// 3年前のレースも同じ名前なので、去年のレースへのリンクで選ぶ。
	const last = rows.filter({
		has: page.locator(`a[href="/races/${GRADED_RACE.lastYearRaceId}"]`)
	});
	await expect(last).toHaveCount(1);
	await expect(last).toContainText(GRADED_RACE.aliasName);
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

	// メモの無い年（今年・一昨年・3年前）は「メモはありません」。
	await expect(rows.filter({ hasText: 'メモはありません' })).toHaveCount(3);

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
	// 去年（別名）・一昨年・3年前の3行。このレース自身（今年）の行は出さない。
	const rows = timeline.locator('ol > li');
	await expect(rows).toHaveCount(3);
	await expect(
		timeline.locator(`a[href="/races/${GRADED_RACE.thisYearRaceId}/preview"]`)
	).toHaveCount(0);

	const last = rows.filter({
		has: page.locator(`a[href="/races/${GRADED_RACE.lastYearRaceId}"]`)
	});
	await expect(last).toHaveCount(1);
	await expect(last).toContainText(GRADED_RACE.aliasName);
	await expect(last).toContainText(GRADED_RACE.outlook);
	await expect(last).toContainText(GRADED_RACE.review);
	await expect(last).toContainText(`勝ち馬 ${GRADED_RACE.winner}`);
	await expect(last.locator('ul > li')).toHaveText([/E2E重賞イチバン.*1着/, /E2E重賞ニバン.*4着/]);
	await expect(rows.filter({ hasText: 'メモはありません' })).toHaveCount(2);
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

const placersRegion = (page: Page) => page.getByRole('region', { name: /過去の好走馬/ });

test('重賞の画面に、過去10年の1〜3着が年ごとに並び、足りない年も分かる', async ({ page }) => {
	await login(page);
	await page.goto(gradedPath(GRADED_RACE.key));

	const section = placersRegion(page);
	await expect(section).toBeVisible();
	// 傾向の下・年ごとのメモの上。
	const ids = await page
		.locator('main > section')
		.evaluateAll((els) => els.map((e) => e.id || e.getAttribute('aria-labelledby')));
	expect(ids.indexOf('graded-placers')).toBe(ids.indexOf('graded-trend') + 1);
	expect(ids.indexOf('graded-years')).toBe(ids.indexOf('graded-placers') + 1);

	// 充足: そろった開催 2（去年・3年前）、一部だけ 1（一昨年）、未登録の年 7。
	await expect(section).toContainText('結果がそろっている開催 2・一部だけ 1・レースが未登録 7年');
	await expect(section).toContainText('1開催は、場・芝ダート・距離のどれかが');
	await expect(section).toContainText(
		'前走は未整備です。当時の直前の出走を確かめられるデータがまだ無いため'
	);

	// 年×着順の表。10年 = 去年・一昨年・3年前 + 未登録7年。
	const table = section.getByRole('table', { name: '年ごとの1〜3着の馬と人気' });
	const tableRows = table.locator('tbody tr');
	await expect(tableRows).toHaveCount(10);
	const last = tableRows.filter({
		has: page.locator(`a[href="/races/${GRADED_PLACERS.lastYearRaceId}"]`)
	});
	await expect(last.locator('td')).toHaveCount(3);
	await expect(last.locator('td').nth(0)).toContainText(GRADED_PLACERS.horses.first);
	await expect(last.locator('td').nth(0)).toContainText('1番人気');
	await expect(last.locator('td').nth(1)).toContainText(GRADED_PLACERS.horses.second);
	await expect(last).not.toContainText('条件が違う');
	await expectLinkTo(
		last.locator('td').nth(0).getByRole('link', { name: GRADED_PLACERS.horses.first }),
		`/horses/01JE2EHORSEGRADED10000000`
	);

	const prev = tableRows.filter({
		has: page.locator(`a[href="/races/${GRADED_PLACERS.prevYearRaceId}"]`)
	});
	await expect(prev.locator('td').filter({ has: page.locator('a') })).toHaveCount(1);
	await expect(prev.locator('td').filter({ hasText: '—' })).toHaveCount(2);

	const ago = tableRows.filter({
		has: page.locator(`a[href="/races/${GRADED_PLACERS.threeYearsAgoRaceId}"]`)
	});
	await expect(ago).toContainText('条件が違う');
	await expect(ago).toContainText('新潟');

	await expect(tableRows.filter({ hasText: 'このレースは未登録' })).toHaveCount(7);

	// 縦の一覧（騎手・父・母父）は閉じた details に畳んである。開くと今までの内容が出る。
	const detail = section.locator('details', { hasText: '年ごとの詳細（騎手・父・母父）' }).last();
	await expect(detail).toHaveJSProperty('open', false);
	await detail.locator('summary').click();
	const rows = detail.locator('ol > li');
	await expect(rows).toHaveCount(10);
	const lastRow = rows.filter({
		has: page.locator(`a[href="/races/${GRADED_PLACERS.lastYearRaceId}"]`)
	});
	await expect(lastRow.locator('ul > li')).toHaveCount(3);
	await expect(lastRow.locator('ul > li').nth(0)).toContainText(GRADED_PLACERS.jockeyTwice);
	await expect(lastRow.locator('ul > li').nth(0)).toContainText(`父 ${GRADED_PLACERS.sireThrice}`);
	await expect(lastRow.locator('ul > li').nth(1)).toContainText('父 不明');
	await expect(rows.filter({ hasText: 'このレースは未登録' })).toHaveCount(7);
	// 今年のレースは窓に入れない。
	await expect(section.locator(`a[href="/races/${GRADED_RACE.thisYearRaceId}"]`)).toHaveCount(0);
	await expect(
		section.locator(`a[href="/races/${GRADED_RACE.thisYearRaceId}/preview"]`)
	).toHaveCount(0);
});

test('過去の好走馬の集計は、年ごとの一覧と照らせる', async ({ page }) => {
	await login(page);
	await page.goto(gradedPath(GRADED_RACE.key));
	const section = placersRegion(page);

	// 人気だけ開いている。3着以内は7頭（1番人気1・2番人気1・3番人気2・4番人気1・6〜9番人気1・10番人気以下1。ニバンは4着で入らない）。
	const aspectDetails = (label: string) =>
		section.locator('details').filter({
			has: page.locator('summary', { hasText: new RegExp(`^\\s*${label}`) })
		});
	await expect(aspectDetails('人気')).toHaveJSProperty('open', true);
	await expect(aspectDetails('騎手')).toHaveJSProperty('open', false);
	const popularity = section.getByRole('table', { name: '人気ごとの勝ち馬と3着以内の数' });
	await expect(popularity.locator('tbody tr')).toHaveCount(7);
	await expect(popularity.locator('tbody tr').nth(0)).toContainText('1番人気');
	await expect(popularity.locator('tbody tr').nth(2)).toContainText('3番人気');
	await expect(popularity.locator('tbody tr').nth(2).locator('td')).toHaveText(['0', '2']);
	await expect(popularity.locator('tbody tr').nth(6)).toContainText('10番人気以下');

	// 騎手: 2回の行だけが表に出る。アルファは去年の1着と3年前の2着。
	await section.getByText('騎手', { exact: false }).first().click();
	const jockey = section.getByRole('table', { name: '騎手ごとの勝ち馬と3着以内の数' });
	const alpha = jockey.locator('tbody tr', { hasText: GRADED_PLACERS.jockeyTwice });
	await expect(alpha).toContainText(`${GRADED_PLACERS.jockeyTwice}`);
	await expect(alpha.locator('td')).toHaveText(['1', '2']);
	await expect(alpha).toContainText('年1着');
	await expect(alpha).toContainText('年2着');
	// 1回だけの騎手は畳んである。
	await expect(jockey.locator('tbody tr', { hasText: GRADED_PLACERS.jockeyOnce })).toHaveCount(0);
	await expect(section.getByText(/1回だけ（\d+）/).first()).toBeVisible();
});

test('今年のレースだけの重賞は、過去の好走馬が空の案内になる', async ({ page }) => {
	await login(page);
	await page.goto(gradedPath(PROFILE_RACE.key));
	const section = placersRegion(page);
	await expect(section).toContainText('のこのレースの結果は、まだ登録されていません。');
	await expect(section.locator('details')).toHaveCount(0);
	await expect(section.locator('ol')).toHaveCount(0);
	await expect(section.locator('table')).toHaveCount(0);
	await expect(section).not.toContainText('前走は');
});

test('レース情報タブの導線から、重賞の画面の過去の好走馬へ行ける', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${GRADED_RACE.thisYearRaceId}/preview`);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();

	const entry = page.getByRole('region', { name: /過去の好走馬/ });
	// 要約: そろった開催 2（去年・3年前）、一部だけ 1（一昨年）、未登録の年 7、条件が違う開催 1（3年前）。人気は数だけ（率は出さない）。
	await expect(entry).toContainText('結果がそろっている開催 2・一部だけ 1・レースが未登録 7年');
	await expect(entry).toContainText(
		`1開催は、場・芝ダート・距離のどれかが${jstYear}年と違います。`
	);
	await expect(entry).toContainText('勝ち馬の人気 1番人気 1・4番人気 1・10番人気以下 1');
	await expect(entry).toContainText(
		'3着以内の人気 1番人気 1・2番人気 1・3番人気 2・4番人気 1・6〜9番人気 1・10番人気以下 1'
	);
	await expect(entry).not.toContainText('%');
	await expect(entry).toContainText(
		'騎手・父・母父ごとの数と年ごとの一覧は、重賞の画面にあります。'
	);
	await expectLinkTo(
		entry.getByRole('link', { name: '重賞の画面で見る' }),
		`${gradedPath(GRADED_RACE.key)}#graded-placers`
	);
	await entry.getByRole('link', { name: '重賞の画面で見る' }).click();
	await expect(page).toHaveURL(`${gradedPath(GRADED_RACE.key)}#graded-placers`);
	await expect(page.locator('#graded-placers')).toBeVisible();
});

test('ふりかえり画面のレース情報タブにも要約が出て、結果の無い重賞は未登録の文になる', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${GRADED_RACE.lastYearRaceId}`);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	await expect(page.getByRole('region', { name: /過去の好走馬/ })).toContainText(
		'結果がそろっている開催 2・一部だけ 1・レースが未登録 7年'
	);

	// 今年のレースだけの重賞（天皇賞（秋））は、窓に結果が無い。
	await gotoHydrated(page, `/races/${PROFILE_RACE.raceId}/preview`);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	const entry = page.getByRole('region', { name: /過去の好走馬/ });
	await expect(entry).toContainText('のこのレースの結果は、まだ登録されていません。');
	await expect(entry.locator('dl')).toHaveCount(0);
});
