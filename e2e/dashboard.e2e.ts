import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import {
	DASHBOARD_RACES,
	LAST_WEEK_RACE_ID,
	OTHER_DISTANCE_RACE_ID,
	THIS_WEEK_RACES,
	WATCH_HORSES
} from './seed';

/** 見出しの文字で枠を選ぶ。並び順ではなく**どの枠に出るか**を見たいので。 */
const section = (page: Page, heading: string) =>
	page.locator('main section').filter({ has: page.getByRole('heading', { name: heading }) });

/**
 * 上から「次にやること」の順。狙う馬 → 答え合わせの宿題 → レース → 読み返し。
 * seed には予想だけしたレースがあるので、ふりかえり待ちの枠も出る。
 */
test('ダッシュボードは注目馬、ふりかえり待ち、今週、過去、メモの順に表示する', async ({ page }) => {
	await login(page);
	await page.goto('/');

	await expect(page.locator('main h2')).toHaveText([
		'今週出走する注目馬',
		'ふりかえり待ち',
		'今週のレース',
		'過去のレース',
		'最近のメモ'
	]);
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

/** 名前だけではどの重賞か分からないので、格の札を名前の**前**に出す。今週も過去も同じ行。 */
test('今週と過去のレースの行で、格の札がレース名の前に出る', async ({ page }) => {
	await login(page);
	await page.goto('/');

	await expect(
		section(page, '今週のレース').getByRole('link', { name: DASHBOARD_RACES.thisWeek })
	).toHaveText(/中京11R\s*G3\s*E2E今週賞/);
	await expect(
		section(page, '過去のレース').getByRole('link', { name: DASHBOARD_RACES.inWindow })
	).toHaveText(/福島10R\s*G3\s*E2E先週賞/);
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

/**
 * ★ 今週出走する注目馬は、**自分が付けた一番新しい結論の札**で決まる。
 * 買い → 消しと書き換えた馬は消しで出て、古い買いのメモは出ない。
 */
test('今週出走する注目馬に、買いと消しが最新の札で並ぶ', async ({ page }) => {
	await login(page);
	await page.goto('/');

	const watch = section(page, '今週出走する注目馬');

	const buy = watch.locator('li', { hasText: WATCH_HORSES.buy });
	await expect(buy).toContainText('次走買い');
	await expect(buy).toContainText('前走は直線で詰まった。次は買い。');
	// 結論以外の札は理由として添う。
	await expect(buy).toContainText('不利');
	// 今週のどのレースに出るか。
	await expect(buy).toContainText(DASHBOARD_RACES.thisWeek);

	const drop = watch.locator('li', { hasText: WATCH_HORSES.drop });
	await expect(drop).toContainText('次走消し');
	await expect(drop).toContainText('距離が合わない。見限る。');
	await expect(watch).not.toContainText('昔は買いだと思っていた。');
});

/**
 * ★ **他人が買いを付けた馬は出ない。** 同じ今週のレースに出走していても、
 * 自分が札を付けていなければ注目馬ではない。本文も画面のどこにも出てはいけない。
 */
test('他人が札を付けた馬は注目馬に出ない', async ({ page }) => {
	await login(page);
	await page.goto('/');

	await expect(section(page, '今週出走する注目馬').getByText(WATCH_HORSES.others)).toHaveCount(0);
	await expect(page.getByText('他人の注目馬。見えてはいけない。')).toHaveCount(0);
});

/**
 * ★ ふりかえり待ちは「予想したのにふりかえっていない」レース。
 * ふりかえりを書けば消える。書いたかどうかは自分のメモだけで決まる。
 */
test('予想だけしたレースがふりかえり待ちに出て、ふりかえると消える', async ({ page }) => {
	await login(page);
	await page.goto('/');

	const awaiting = section(page, 'ふりかえり待ち');
	await expect(awaiting.getByText(DASHBOARD_RACES.inWindow)).toBeVisible();
	// 過去のレースの行にも同じ宿題の札が付く。
	await expect(
		section(page, '過去のレース').locator('li', { hasText: DASHBOARD_RACES.inWindow })
	).toContainText('ふりかえり待ち');

	// 押すとふりかえり画面へ（予想画面ではない）。
	await awaiting.getByRole('link', { name: new RegExp(DASHBOARD_RACES.inWindow) }).click();
	await expect(page).toHaveURL(`/races/${LAST_WEEK_RACE_ID}`);
	// '/' の hydration 前に押すと、クライアント側の遷移ではなく読み込み直しになる。
	await waitForHydration(page);

	await page.locator('textarea[name="raceNoteBody"]').fill('見立てどおり前残り。');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'ふりかえり待ち' })).toHaveCount(0);
	await expect(
		section(page, '過去のレース').locator('li', { hasText: DASHBOARD_RACES.inWindow })
	).toContainText('ふりかえり済');

	// 後片付け。空で保存するとふりかえりは消え、宿題に戻る。
	await gotoHydrated(page, `/races/${LAST_WEEK_RACE_ID}`);
	await page.locator('textarea[name="raceNoteBody"]').fill('');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
});

/**
 * リンク先は結果が出たかで分ける（→ `opensReview`）。ダッシュボードの中でもずらさない。
 * - 注目馬の出走（E2E今週賞・着順なし）→ 予想画面
 * - 今週のレースで着順の入ったもの（E2E結果確定賞）→ ふりかえり
 * - ふりかえりのメモ（E2E別距離賞のレースのメモ。出走0頭で着順なし）→ それが書いてあるふりかえり
 */
test('ダッシュボードのリンクは、結果が出たものとふりかえりのメモだけふりかえりへ行く', async ({
	page
}) => {
	await login(page);
	await page.goto('/');

	const { settled, upcoming } = THIS_WEEK_RACES;
	await expect(
		section(page, '今週出走する注目馬')
			.locator('li', { hasText: WATCH_HORSES.buy })
			.getByRole('link', { name: new RegExp(upcoming.name) })
	).toHaveAttribute('href', `/races/${upcoming.id}/preview`);
	await expect(
		section(page, '今週のレース').getByRole('link', { name: new RegExp(settled.name) })
	).toHaveAttribute('href', `/races/${settled.id}`);
	await expect(
		section(page, '最近のメモ').getByRole('link', { name: /E2E別距離賞/ })
	).toHaveAttribute('href', `/races/${OTHER_DISTANCE_RACE_ID}`);
});

/**
 * 「すべてのレースを見る」は名乗りどおり全件へ。`/races` だけだと
 * レース一覧の既定（今年の重賞）で開き、条件戦も去年のレースも出ない。
 */
test('「すべてのレースを見る」は絞り込みなしのレース一覧へ行く', async ({ page }) => {
	await login(page);
	await page.goto('/');

	await expect(page.getByRole('link', { name: 'すべてのレースを見る →' })).toHaveAttribute(
		'href',
		'/races?year='
	);
});
