import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import {
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	OTHER_DISTANCE_NOTE_BODY,
	OTHER_USER_SAME_CONDITION_BODY,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	SAME_CONDITION_NOTE_BODY
} from './seed';

/**
 * この画面の用は「16頭を見比べる」ことなので、**自分の出走前メモは開かずに読める**
 * のが正。畳まれていた頃は1頭ずつ開かないと自分の見解が見えなかった。
 */
test('書いた出走前メモは、開かなくても本文と付けた札が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 何も開いていない状態で、本文と付けた札の両方が畳まれた見出しに出ていること。
	// 札の名前は TagPicker 側にも（伏せた状態で）あるので、summary に絞って見る。
	// 出走馬の行の summary だけ（コース図もスマホ用に summary を持つ）。
	const summary = page.locator('main li[id^="entry-"] summary');
	await expect(summary).toContainText('今回は内枠が向きそう。');
	await expect(summary).toContainText('次走買い');

	// 選んでいない札（TagPicker の全選択肢）は伏せたまま。
	// こちらは TagBadges に出ないので、画面に1つしか無い＝そのまま見に行ける。
	await expect(page.getByText('好上がり', { exact: true })).toBeHidden();
	// 本文の入力欄も畳まれている（畳むのは書く側だけ）。
	// **画面にはレースの見立ての欄も出ている**ので、出走馬のぶんだけを名前で選ぶ。
	await expect(page.locator('textarea[name^="body."]')).toBeHidden();
});

test('「書き直す」を開くと、本文欄と全部の札が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await page.getByText('書き直す', { exact: true }).click();

	// 入力欄には保存済みの本文が入っている（見立ての欄と混ざらないよう名前で選ぶ）。
	await expect(page.locator('textarea[name^="body."]')).toHaveValue('今回は内枠が向きそう。');
	// 選んでいない札もここで初めて出る（付け足せる）。
	await expect(page.getByText('好上がり', { exact: true })).toBeVisible();
	// 付けた札はチェック済みで出る。
	await expect(page.getByRole('checkbox', { name: '次走買い' })).toBeChecked();
});

/**
 * オッズは Cron が D1 に置いたもの（seed の race_odds）を出すだけ。画面から取得元へは行かない。
 * **時点を必ず添える**（30分おきにしか取らず、失敗した回は前の値が残るため）。
 */
test('出走馬の単勝・複勝オッズを、取れた時点とともに出す', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await expect(page.getByText('単勝・複勝のオッズは 5/5 14:30時点')).toBeVisible();
	const row = page.locator('main li[id^="entry-"]');
	await expect(row).toContainText(/単勝\s*3\.4\s*複勝\s*1\.4-1\.8/);
});

test('オッズが1度も取れていないレースでは、オッズの欄を出さない', async ({ page }) => {
	await login(page);
	// 出走馬はいるが、race_odds の行が無いレース
	await page.goto(`/races/${BRACKET_RACE_ID}/preview`);

	await expect(page.locator('main li[id^="entry-"]').first()).toBeVisible();
	await expect(page.getByText(/のオッズは/)).toHaveCount(0);
	await expect(page.getByText('単勝')).toHaveCount(0);
});

/**
 * 枠の札がこの画面にも配線されていること。色そのものは BracketBadge の
 * 表が持っていて、ふりかえり画面と同じ部品なので、ここでは出ているかだけを見る。
 */
test('出走馬の枠番が枠の札で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	const bracket = page.getByTitle('2枠');
	await expect(bracket).toBeVisible();
	await expect(bracket).toHaveText('2');

	// 枠の色は馬番を置き換えるものではない。両方出ていること。
	const row = page.locator('main > form > ul > li').first();
	await expect(row).toContainText('3');
});

/**
 * ★ **出走馬が1頭も決まっていない未来のレースにメモを書けること。**
 *
 * これから組まれる重賞は、出馬表が出る前に日付と格だけ先に登録される
 * （README「出走馬データ」）。その段階で「このレースを狙う」と書き留める先が
 * 無いと、思いついたことを置く場所がどこにも無い。
 *
 * 本番ビルドで走るので、form POST が CSRF 検証を通ることもここで一緒に見ている。
 */
test('出走馬がいない未来のレースでも、レースの見立てを書いて保存できる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${EMPTY_RACE_ID}/preview`);

	// 出走馬はいないが、見立ての欄はある。
	await expect(page.getByText('出走馬がまだ登録されていません。')).toBeVisible();
	const body = page.locator('textarea[name="raceNoteBody"]');
	await expect(body).toHaveValue('');

	await body.fill('開幕週で内有利になりそう。前に行ける馬から。');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();

	await expect(page.getByText('保存しました')).toBeVisible();

	// 読み込み直しても残っている（＝DB に入っている）。
	await page.reload();
	await expect(page.getByRole('textbox')).toHaveValue(
		'開幕週で内有利になりそう。前に行ける馬から。'
	);

	// 後片付け。空で保存すると消える仕様なので、それで元に戻す。
	await waitForHydration(page);
	await page.getByRole('textbox').fill('');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
});

/** 開催前はふりかえりが書けないので、その導線も出さない。 */
test('開催前の予想画面に「ふりかえりを書く」は出ない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${EMPTY_RACE_ID}/preview`);

	await expect(page.getByRole('link', { name: 'ふりかえりを書く' })).toHaveCount(0);
});

/** 開催済みなら、予想画面からふりかえりへ行ける。 */
test('開催済みの予想画面には「ふりかえりを書く」が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}/preview`);

	await expect(page.getByRole('link', { name: 'ふりかえりを書く' })).toBeVisible();
});

/**
 * 見出しはふりかえりと同じ形（1行目は場・R とレース名、日付は2行目）。
 * 以前は見出しの上に「今週の重賞」への戻りリンクがあり、2画面を行き来すると別物に見えた。
 */
test('予想画面の見出しは、ふりかえりと同じ形で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^京都11R\s*E2E予想賞$/);
	await expect(page.locator('main').getByText('2099-05-05 · 芝2200m / 1頭')).toBeVisible();
	await expect(page.locator('main').getByRole('link', { name: '今週の重賞' })).toHaveCount(0);
});

/**
 * ★ 見立てを書く手元に、**同じ条件（京都 芝2200m）で前に自分が書いたレースのメモ**が出る。
 * 距離だけ違うレースのメモと、他人のメモは出ない。
 */
test('見立ての下に、同じ条件で前に書いた自分のレースのメモが出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await expect(page.getByText('同じ条件（京都 芝2200m）で書いたレースのメモ')).toBeVisible();
	await expect(page.getByText(SAME_CONDITION_NOTE_BODY)).toBeVisible();
	// 押すとそのレースのふりかえりへ。
	await expect(page.getByRole('link', { name: /E2E同条件賞/ })).toHaveAttribute(
		'href',
		/^\/races\/01JE2ERACESAMECOND/
	);

	// 条件が違う（距離が違う）レースのメモは出ない。
	await expect(page.getByText(OTHER_DISTANCE_NOTE_BODY)).toHaveCount(0);
	// ★ 同じ条件のレースでも、他人のメモは出ない。
	await expect(page.getByText(OTHER_USER_SAME_CONDITION_BODY)).toHaveCount(0);
});

/**
 * 16頭を見比べるときは本文まで読めない。**前回の結論の札**を行の見出しに上げる。
 * seed では、この馬の前走のふりかえりに「次走買い」「不利」が付いている。
 */
test('出走馬の行の見出しに、前回付けた結論の札が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	const row = page.locator('main > form > ul > li').first();
	const conclusion = row.getByTitle('2026-04-26 に付けた札');
	await expect(conclusion).toContainText('前回');
	await expect(conclusion).toContainText('次走買い');
	await expect(conclusion).toContainText('不利');
});

/**
 * 馬柱の各走に、タイムと通過順が2行目として出る。
 * seed では、この馬の前走（E2E同条件賞・4着）に 2:12.8 と 8-8-7-6 が入っていて、
 * 3走前（E2E霜月特別）にはどちらも無い。
 */
test('馬柱の走に、タイムと通過順が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 同じ行の「自分の過去メモ」も ol > li でレース名を含むので、馬柱にだけ出る条件（芝2200m）で絞る
	const run = page
		.locator('main > form > ul > li')
		.first()
		.locator('ol > li', { hasText: 'E2E同条件賞' })
		.filter({ hasText: '芝2200m' });
	await expect(run).toContainText('4着');
	await expect(run).toContainText('タイム2:12.8');
	await expect(run).toContainText('通過順8-8-7-6');

	// タイムも通過順も入っていない走（E2E霜月特別）には2行目が出ない
	const noTime = page
		.locator('main > form > ul > li')
		.first()
		.locator('ol > li', { hasText: 'E2E霜月特別' });
	await expect(noTime).toContainText('1着');
	await expect(noTime).not.toContainText('タイム');
	await expect(noTime).not.toContainText('通過順');
});

/** 付けた印は画面の上にまとめて出る。押すとその馬の行へ飛ぶ。 */
test('付けた印が画面の上にまとまって出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	const marks = page.locator('section', { has: page.getByRole('heading', { name: '付けた印' }) });
	await expect(marks).toContainText('◎');
	await expect(marks).toContainText('E2Eプレビューホース');

	await marks.getByRole('link', { name: /E2Eプレビューホース/ }).click();
	await expect(page).toHaveURL(/#entry-01JE2EENTRYPREVIEW/);
});

/** 印を1つも付けていないレースでは、空の「付けた印」の枠を出さない。 */
test('印を付けていなければ「付けた印」の枠は出ない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${EMPTY_RACE_ID}/preview`);

	await expect(page.getByRole('heading', { name: '付けた印' })).toHaveCount(0);
});

test('未ログインでは同じ条件のレースのメモも漏れない', async ({ page }) => {
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await expect(page).toHaveURL(/\/login\?redirect=/);
	await expect(page.getByText(SAME_CONDITION_NOTE_BODY)).toHaveCount(0);
});
