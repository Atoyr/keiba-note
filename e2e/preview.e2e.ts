import { expect, test } from '@playwright/test';
import { login } from './login';
import { EMPTY_RACE_ID, PAST_EMPTY_RACE_ID, PREVIEW_RACE_ID } from './seed';

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
