import { expect, test } from '@playwright/test';
import { login } from './login';
import {
	EMPTY_RACE_ID,
	OTHER_DISTANCE_NOTE_BODY,
	OTHER_USER_SAME_CONDITION_BODY,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	SAME_CONDITION_NOTE_BODY
} from './seed';

test('未ログインでは予想画面を開けない', async ({ page }) => {
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await expect(page).toHaveURL(
		`/login?redirect=${encodeURIComponent(`/races/${PREVIEW_RACE_ID}/preview`)}`
	);
	// 出走前メモの中身が1文字も漏れていないこと。
	await expect(page.getByText('今回は内枠が向きそう。')).toHaveCount(0);
});

/**
 * この画面の用は「16頭を見比べる」ことなので、**自分の出走前メモは開かずに読める**
 * のが正。畳まれていた頃は1頭ずつ開かないと自分の見解が見えなかった。
 */
test('書いた出走前メモは、開かなくても本文と付けた札が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 何も開いていない状態で、本文と付けた札の両方が畳まれた見出しに出ていること。
	// 札の名前は TagPicker 側にも（伏せた状態で）あるので、summary に絞って見る。
	const summary = page.locator('main summary');
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
 * 枠は色で読む。ふりかえり画面と同じ札を使うので、**予想で見た枠と
 * 結果で見る枠が別物に見えない**ことを、こちら側でも1本押さえておく。
 */
test('出走馬の枠番が枠の色で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	const bracket = page.getByTitle('2枠');
	await expect(bracket).toBeVisible();
	await expect(bracket).toHaveText('2');
	await expect(bracket).toHaveClass(/bg-gray-900/);

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
	await page.goto(`/races/${EMPTY_RACE_ID}/preview`);

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
