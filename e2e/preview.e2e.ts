import { expect, test, type Locator } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import { openRaceMenu, raceMenuItem } from './race-menu';
import {
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	MARKS_RACE_ID,
	OTHER_DISTANCE_NOTE_BODY,
	OTHER_USER_SAME_CONDITION_BODY,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	SAME_CONDITION_NOTE_BODY
} from './seed';
import { expectLinkTo } from './link';

/** 行のメモそのもの（書いたメモがあるときの、押すと書き直せるボタン）。 */
const memoButton = (row: Locator) => row.getByRole('button', { name: /出走前メモを書き直す/ });
/** 行に見えているメモ（本文と札）。詳細情報の中は畳んでいるので数えない。 */
const memoText = (row: Locator) => row.locator('.entry-memo:visible');

test('行は畳まず、印とメモ（本文・札）をそのまま表示し、メモを押すとその場で入力欄に切り替わる', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	const row = page.locator('main li[id^="entry-"]');
	const memo = memoText(row);
	// 開かなくても、書いた本文と札が読める。状態の文言（予想メモあり）は出さない。
	await expect(memo).toBeVisible();
	await expect(memo).toContainText('今回は内枠が向きそう。');
	await expect(memo).toContainText('次走買い');
	// 種別の札。無いと、見出しの「前回」の札の続きに読める。
	await expect(memo).toContainText('出走前');
	await expect(row.getByText('予想メモあり')).toHaveCount(0);
	await expect(row.getByText('メモを入力する')).toHaveCount(0);
	await expect(row.getByText('過去のメモあり')).toHaveCount(0);
	await expect(row.locator('textarea')).toBeHidden();
	await expect(row.getByTitle('予想印 ◎')).toBeVisible();
	// 印は行を開かなくても選べる（ボタンは正方形・左寄せ）。
	const marks = row.getByRole('radiogroup', { name: /予想印/ });
	await expect(marks).toBeVisible();
	const tile = (await marks.getByText('◎', { exact: true }).boundingBox())!;
	expect(tile.width).toBe(tile.height);
	expect(tile.x).toBeLessThan((await marks.boundingBox())!.x + 1);

	await memoButton(row).click();
	// 押すと入力欄に替わり、同じものが2つ並ばないよう書いたメモの表示は消える。本文の欄にフォーカスが移る。
	await expect(memo).toHaveCount(0);
	await expect(row.locator('textarea')).toBeFocused();
	await expect(row.locator('textarea')).toHaveValue('今回は内枠が向きそう。');
	await expect(row.getByText('過去走の記録がありません。')).toHaveCount(0);
	// 見出しを押して折りたたむと、書いたメモの表示に戻り、フォーカスもそのボタンへ戻る。
	await row.getByRole('button', { name: /出走前メモ/, expanded: true }).click();
	await expect(row.locator('textarea')).toBeHidden();
	await expect(memo).toContainText('今回は内枠が向きそう。');
	await expect(memoButton(row)).toBeFocused();
	// Esc でも同じ。
	await memoButton(row).click();
	await page.keyboard.press('Escape');
	await expect(row.locator('textarea')).toBeHidden();
	await expect(memoButton(row)).toBeFocused();
});

/** 保存する前でも、いま入力している本文と札を行に出す（古い保存済みの値が残ると、書いたものが消えたように見える）。 */
test('書いた本文と札は、保存する前から行に出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	const row = page.locator('main li[id^="entry-"]');
	const memo = memoText(row);
	await memoButton(row).click();
	await row.locator('textarea').fill('書き換えた本文。まだ保存しない。');
	await row.getByRole('checkbox', { name: '次走買い' }).uncheck({ force: true });
	await row.getByRole('checkbox', { name: '馬場一致' }).check({ force: true });
	await row.getByRole('button', { name: /出走前メモ/, expanded: true }).click();

	await expect(memo).toBeVisible();
	await expect(memo).toContainText('書き換えた本文。まだ保存しない。');
	await expect(memo).toContainText('馬場一致');
	await expect(memo).not.toContainText('次走買い');
	await expect(memo).not.toContainText('今回は内枠が向きそう。');
});

test('メモを押すと、本文欄と全部の札が出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	await memoButton(page.locator('main li[id^="entry-"]')).click();

	// 入力欄には保存済みの本文が入っている（見立ての欄と混ざらないよう名前で選ぶ）。
	await expect(page.locator('textarea[name^="body."]')).toHaveValue('今回は内枠が向きそう。');
	// 選んでいない札もここで初めて出る（付け足せる）。
	await expect(page.getByText('好上り', { exact: true })).toBeVisible();
	// 付けた札はチェック済みで出る。
	await expect(page.getByRole('checkbox', { name: '次走買い' })).toBeChecked();
});

/**
 * 行の並びは 見出し → 詳細情報 → 印 → 出走前メモ。メモが無い馬は「＋ 出走前メモ」を押すとその場で書ける。
 * 書いて折りたたむと行に書いたメモが出る。保存して再読み込みしても残ることは race-rows.e2e.ts で見る
 * （印見本のレースは読むだけの前提なので、ここでは保存しない）。
 */
test('「＋ 出走前メモ」を押してその場で書き、折りたたむと行に書いたメモが出る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/preview`);
	const row = page.locator('li[id^="entry-"]', { hasText: 'E2Eタンアナ' });
	await expect(row.getByText('メモを入力する')).toHaveCount(0);
	await expect(row.getByText('過去のメモあり')).toHaveCount(0);

	// 並び: 詳細情報 → 印 → 出走前メモ。
	const details = row.locator(':scope > div > details');
	const marks = row.getByRole('radiogroup', { name: /予想印/ });
	const add = row.getByRole('button', { name: /＋ 出走前メモ/ });
	const y = async (l: Locator) => (await l.boundingBox())!.y;
	expect(await y(details)).toBeLessThan(await y(marks));
	expect(await y(marks)).toBeLessThan(await y(add));

	await add.click();
	await expect(row.locator('textarea')).toBeFocused();
	await row.locator('textarea').fill('距離短縮で前に行けそう。');
	await row.getByRole('checkbox', { name: '次走買い' }).check({ force: true });
	// 印は入力欄を開いたままでも、閉じていても選べる。
	await marks.getByText('○', { exact: true }).click();
	await row.getByRole('button', { name: /出走前メモ/, expanded: true }).click();
	await expect(memoText(row)).toContainText('距離短縮で前に行けそう。');
	await expect(memoText(row)).toContainText('次走買い');
	// 見出しの印も、選んだ ○ に追従する（保存済みは ▲）。
	await expect(row.getByTitle('予想印 ○')).toBeVisible();
	await expect(row.getByTitle('予想印 ▲')).toHaveCount(0);

	// 書いたメモを押すと入力欄に戻る。
	await memoButton(row).click();
	await expect(row.locator('textarea')).toBeVisible();
	await expect(row.locator('textarea')).toHaveValue('距離短縮で前に行けそう。');
	await expect(row.getByRole('checkbox', { name: '次走買い' })).toBeChecked();
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
	await expect(row).toContainText(/単勝\s*3\.4/);
	await expect(row).toContainText(/複勝\s*1\.4 - 1\.8/);
});

/**
 * 人気は単勝オッズの低い順。同じオッズは同じ人気で、取消（単勝なし）には付けない。
 * seed の印見本のレースは ①2.8 ②5.1 ③5.1 ④12.4 ⑤123.4 ⑥8.9 ⑦取消。
 */
test('単勝オッズから人気を付けて、オッズの行の頭に出す', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${MARKS_RACE_ID}/preview`);

	const row = (name: string) => page.locator('main li[id^="entry-"]', { hasText: name });
	await expect(row('E2Eホンメイ')).toContainText(/1人気\s*単勝\s*2\.8/);
	await expect(row('E2Eタイコウ')).toContainText(/2人気\s*単勝\s*5\.1/);
	await expect(row('E2Eタンアナ')).toContainText(/2人気\s*単勝\s*5\.1/);
	await expect(row('E2Eケシウマ')).toContainText(/4人気\s*単勝\s*8\.9/);
	await expect(row('E2Eメモノミ')).toContainText(/単勝\s*-/);
	await expect(row('E2Eメモノミ')).toContainText(/複勝\s*-/);
	await expect(row('E2Eメモノミ')).not.toContainText('人気');
});

/**
 * 馬名は折り返さず1行に収める（全角9文字がスマホで切れない）。seed の印見本のレースの⑤は
 * 全角カタカナ9文字で、単勝 123.4・複勝 18.2 - 30.5 と、オッズの列をいちばん広く使う行。
 */
test('スマホの幅でも、全角9文字の馬名が切れずに出る', async ({ page }) => {
	await login(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`/races/${MARKS_RACE_ID}/preview`);

	const name = page
		.locator('main li[id^="entry-"]', { hasText: 'アナウマスペシャル' })
		.getByRole('link', { name: 'アナウマスペシャル', exact: true })
		// 切り詰めは中の span が受け持つので、測るのは span。
		.locator('span');
	await expect(name).toHaveText('アナウマスペシャル');
	const { scrollWidth, clientWidth } = await name.evaluate((el) => ({
		scrollWidth: el.scrollWidth,
		clientWidth: el.clientWidth
	}));
	expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

/**
 * ★ 人気順に並べ替えられる。並べ替えは離脱ではないので、書きかけがあっても確認を出さず、
 * 書いたものも消えない（URL を変えずに画面の中で並べ替える）。
 */
test('出走馬を人気順に並べ替えられ、書きかけのメモはそのまま残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/preview`);
	const names = page.locator('main li[id^="entry-"] a[href^="/horses/"]');
	const byNumber = [
		'E2Eホンメイ',
		'E2Eタイコウ',
		'E2Eタンアナ',
		'E2Eレンシタ',
		'アナウマスペシャル',
		'E2Eケシウマ',
		'E2Eメモノミ'
	];
	await expect(names).toHaveText(byNumber);

	const body = page.locator('textarea[name="raceNoteBody"]');
	await body.fill('外差しが決まる馬場。');
	let asked = false;
	page.on('dialog', (d) => {
		asked = true;
		void d.dismiss();
	});

	const order = page.getByRole('group', { name: '並び順' });
	await order.getByRole('button', { name: '人気順' }).click();
	await expect(order.getByRole('button', { name: '人気順' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	// 同じ2人気は馬番の順、取消（人気なし）は最後。
	await expect(names).toHaveText([
		'E2Eホンメイ',
		'E2Eタイコウ',
		'E2Eタンアナ',
		'E2Eケシウマ',
		'E2Eレンシタ',
		'アナウマスペシャル',
		'E2Eメモノミ'
	]);
	await expect(page).toHaveURL(`/races/${MARKS_RACE_ID}/preview`);
	await expect(body).toHaveValue('外差しが決まる馬場。');
	expect(asked).toBe(false);

	await order.getByRole('button', { name: '馬番順' }).click();
	await expect(names).toHaveText(byNumber);
});

/**
 * 出走馬の行の馬名の左に、出馬表と同じ性齢（牡4・牝4・セ4）が出る。馬齢はレースの日付の年 − 生年。
 * seed の E2E印見本特別（2026-06-07）では、ホンメイが牡・タイコウが牝・アナウマがセ（どれも2022年生）、
 * レンシタは性が無く生年だけ（4歳）、メモノミは性も生年も無い。予想賞（2099年）の馬も性も生年も無い。
 */
test('出走馬の行の馬名の左に、性齢が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${MARKS_RACE_ID}/preview`);

	const row = (name: string) => page.locator('main li[id^="entry-"]', { hasText: name });

	await expect(row('E2Eホンメイ')).toContainText(/牡4\s*E2Eホンメイ/);
	await expect(row('E2Eタイコウ')).toContainText(/牝4\s*E2Eタイコウ/);
	await expect(row('アナウマスペシャル')).toContainText(/セ4\s*アナウマスペシャル/);
	await expect(row('E2Eレンシタ')).toContainText(/4歳\s*E2Eレンシタ/);

	// 性も生年も無い馬には何も出さない。
	await expect(row('E2Eメモノミ')).not.toContainText(/[牡牝セ]\d|\d歳/);

	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);
	await expect(page.locator('main li[id^="entry-"]')).not.toContainText(/[牡牝セ]\d|\d歳/);
});

test('オッズが1度も取れていないレースでは、オッズの欄を出さない', async ({ page }) => {
	await login(page);
	// 出走馬はいるが、race_odds の行が無いレース
	await page.goto(`/races/${BRACKET_RACE_ID}/preview`);

	await expect(page.locator('main li[id^="entry-"]').first()).toBeVisible();
	await expect(page.getByText(/のオッズは/)).toHaveCount(0);
	await expect(page.getByText('単勝')).toHaveCount(0);
	// 人気も無いので、並べ替えも出さない。
	await expect(page.getByRole('group', { name: '並び順' })).toHaveCount(0);
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

	// 枠の色は馬番を置き換えるものではない。両方が1つの札として並んで出ていること。
	const number = page.getByTitle('3番');
	await expect(number).toHaveText('3');
	await expect(bracket.locator('xpath=following-sibling::*[1]')).toHaveAttribute('title', '3番');
});

test('レースの見立ての placeholder は本文より薄い色で、入力済みに見えない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${EMPTY_RACE_ID}/preview`);
	const body = page.locator('textarea[name="raceNoteBody"]');
	await expect(body).toHaveValue('');
	// shadcn の placeholder:text-muted-foreground に負けず、薄いトークンの色が当たっていること
	const colors = await body.evaluate((el) => {
		const probe = document.createElement('span');
		probe.style.color = 'var(--placeholder)';
		document.body.append(probe);
		const token = getComputedStyle(probe).color;
		probe.remove();
		return {
			placeholder: getComputedStyle(el, '::placeholder').color,
			token,
			text: getComputedStyle(el).color
		};
	});
	expect(colors.placeholder).toBe(colors.token);
	expect(colors.placeholder).not.toBe(colors.text);
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
	// 何も変えていないうちは保存ボタンを出さない。
	const save = page.getByRole('button', { name: 'レースの見立てを保存' });
	await expect(save).toHaveCount(0);

	// OS がダークの端末でも、トーストはライトで出て、画面の color-scheme も書き換えない（このアプリはライトだけ）。
	await page.emulateMedia({ colorScheme: 'dark' });

	await body.fill('開幕週で内有利になりそう。前に行ける馬から。');
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	// キーボードで押す。ボタンが消えたあと、フォーカスが行き場を失わないことを見る。
	await save.press('Enter');

	// 知らせはトーストで出る。保存が通ったのでボタンは消え、フォーカスはフォームへ移る。
	await expect(page.locator('[data-sonner-toast]')).toContainText('保存しました');
	await expect(save).toHaveCount(0);
	await expect(page.locator('main form[method="POST"]')).toBeFocused();
	await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'light');
	expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('');

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
test('開催前の予想画面のメニューに「ふりかえりを書く」は出ない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${EMPTY_RACE_ID}/preview`);
	await openRaceMenu(page);

	// 他の項目は出ている（メニューが開いていないせいで 0 件になっていないことの確認）。
	await expect(page.getByRole('menuitem', { name: '予想をまとめて見る' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'ふりかえりを書く' })).toHaveCount(0);
});

/** 開催済みなら、予想画面からふりかえりへ行ける。 */
test('開催済みの予想画面のメニューには「ふりかえりを書く」が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}/preview`);

	await expectLinkTo(await raceMenuItem(page, 'ふりかえりを書く'), `/races/${PAST_EMPTY_RACE_ID}`);
});

/**
 * 見出しはふりかえりと同じ形（1行目は場・R とレース名、日付は2行目）。
 * 以前は見出しの上に「今週の重賞」への戻りリンクがあり、2画面を行き来すると別物に見えた。
 */
test('予想画面の見出しは、ふりかえりと同じ形で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 1行目は場・R とレース名、右端に発走時刻。格の札は2行目の先頭（日付の前）。
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^京都11R\s*E2E予想賞$/);
	await expect(page.locator('main').getByText('15:45発走')).toBeVisible();
	const sub = page.locator('main p', { hasText: '2099-05-05 · 芝2200m' });
	await expect(sub).toBeVisible();
	await expect(sub.locator('[data-slot="badge"]')).toHaveText('G2');
	await expect(page.locator('main').getByRole('link', { name: '今週の重賞' })).toHaveCount(0);
});

/**
 * ★ 見立てを書く手元に、**同じ条件（京都 芝2200m）で前に自分が書いたレースのメモ**が出る。
 * 距離だけ違うレースのメモと、他人のメモは出ない。
 */
test('見立ての下に、同じ条件で前に書いた自分のレースのメモが出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	await waitForHydration(page);
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	const same = page.getByRole('region', { name: /同じ条件で書いたレースのメモ/ });
	await expect(same).toContainText('（京都 芝2200m）');
	await expect(page.getByText(SAME_CONDITION_NOTE_BODY)).toBeVisible();
	// 押すとそのレースのふりかえりへ。
	await expectLinkTo(
		page.getByRole('link', { name: /E2E同条件賞/ }),
		'/races/01JE2ERACESAMECOND0000000'
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

	const row = page.locator('main li[id^="entry-"]').first();
	const conclusion = row.getByTitle('2026-04-26 に付けた札');
	await expect(conclusion).toContainText('前回');
	await expect(conclusion).toContainText('次走買い');
	await expect(conclusion).toContainText('不利');
});

/**
 * 馬柱は列のそろった表。各走に、着順/頭数・枠-馬番・通過・上り・人気の列と、2段目に騎手・勝ち馬とタイム差・タイムが出る。
 * 日付は YY/MM/DD。
 * seed では、この馬の前走（E2E同条件賞・4着）は16頭の3枠5番で、勝ち馬と 0.4 差、2:12.8 と 8-8-7-6。
 * 3走前（E2E霜月特別）は勝った走で、馬番・騎手と2着馬との差だけ（頭数・枠・タイム・通過順が無い）。
 */
test('馬柱の走に、頭数・枠・馬番・騎手・勝ち馬とタイム・通過順が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 1走は1つの tbody（1段目が数字の列、2段目が補足）。表の下の「自分の過去メモ」は tbody ではない
	await waitForHydration(page);
	await page
		.locator('main li[id^="entry-"]', { hasText: 'E2Eプレビューホース' })
		.locator('summary', { hasText: '詳細情報（メモ・直近5走）' })
		.click();
	const run = page
		.locator('main li[id^="entry-"]')
		.first()
		.locator('tbody', { hasText: 'E2E同条件賞' })
		.filter({ hasText: '芝2200m' });
	const cells = run.locator('tr').first().locator('td');
	await expect(run).toContainText('26/04/26');
	await expect(cells.nth(1)).toHaveText('4/16');
	await expect(cells.nth(2)).toHaveText('3-5');
	await expect(cells.nth(3)).toHaveText('8-8-7-6');
	await expect(run).toContainText('騎手E2E騎手');
	// 負けた走は勝ち馬とのタイム差。2着馬は出さない
	await expect(run).toContainText('勝ち馬E2E勝ち馬（0.4）');
	await expect(run).not.toContainText('E2E2着馬');
	await expect(run).toContainText('タイム2:12.8');

	// 頭数・枠・タイム・通過順が入っていない走（E2E霜月特別）は、入っているものだけ出す
	const noTime = page
		.locator('main li[id^="entry-"]')
		.first()
		.locator('tbody', { hasText: 'E2E霜月特別' });
	const noTimeCells = noTime.locator('tr').first().locator('td');
	await expect(noTimeCells.nth(1)).toHaveText('1着');
	await expect(noTimeCells.nth(2)).toHaveText('2番');
	await expect(noTimeCells.nth(3)).toHaveText('—');
	// 勝った走は2着馬と、2着につけた差（負）
	await expect(noTime).toContainText('2着馬E2E霜月2着馬（-0.2）');
	await expect(noTime).not.toContainText('頭');
	// 読み上げ用の「タイム差」はあるので、「タイム」の直後に数字が続くかで見る
	await expect(noTime).not.toContainText(/タイム\d/);
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

/**
 * ★ 書きかけのままアプリ内のリンクで離れようとしたら止める。
 *
 * SvelteKit のリンクは読み込み直さずに画面を差し替えるので、`beforeunload` の確認は出ない。
 * 見立てを直している途中でヘッダーの「レース」を押すと、黙って離れていた。
 */
test('見立てを書きかけのままヘッダーのリンクを押すと、離れる前に確認が出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/preview`);
	const body = page.locator('textarea[name="raceNoteBody"]');
	await body.fill('外差しが決まる馬場。');

	// 「キャンセル」なら画面に残り、書いたものもそのまま。
	const messages: string[] = [];
	page.once('dialog', (d) => {
		messages.push(d.message());
		void d.dismiss();
	});
	await page.getByRole('navigation').getByRole('link', { name: 'レース' }).click();
	await expect
		.poll(() => messages)
		.toEqual(['保存していない変更があります。保存せずにこのページを離れますか？']);
	await expect(page).toHaveURL(`/races/${MARKS_RACE_ID}/preview`);
	await expect(body).toHaveValue('外差しが決まる馬場。');

	// 「OK」なら離れる。
	page.once('dialog', (d) => void d.accept());
	await page.getByRole('navigation').getByRole('link', { name: 'レース' }).click();
	await expect(page).toHaveURL(/\/races(\?|$)/);
});

/** 同じ画面の中のアンカー（付けた印から馬の行へ）は離脱ではないので止めない。 */
test('書きかけでも、付けた印から馬の行へ飛ぶときは確認を出さない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}/preview`);
	await page.locator('textarea[name="raceNoteBody"]').fill('外差しが決まる馬場。');

	let asked = false;
	page.on('dialog', (d) => {
		asked = true;
		void d.dismiss();
	});
	await page.getByRole('region', { name: '付けた印' }).getByRole('link').first().click();
	await expect(page).toHaveURL(new RegExp(`/races/${MARKS_RACE_ID}/preview#entry-`));
	expect(asked).toBe(false);
});

/**
 * JavaScript が無いと未保存の件数を数えられない。そのとき保存ボタンまで隠すと、
 * フォームが送れなくなる。JS が無いときは常に出す。
 */
test.describe('JavaScript が無いとき', () => {
	test.use({ javaScriptEnabled: false });

	test('保存ボタンは最初から出ている', async ({ page }) => {
		await login(page);
		await page.goto(`/races/${MARKS_RACE_ID}/preview`);
		await expect(page.getByRole('button', { name: '出走前メモを保存' })).toBeVisible();
	});

	// 見出しの `⋯` は JS で開く。JS が無いときは、同じ導線を見出しの下のリンクで出す。
	test('見出しのメニューの導線が、見出しの下のリンクとして出ている', async ({ page }) => {
		await login(page);
		await page.goto(`/races/${PAST_EMPTY_RACE_ID}/preview`);
		// SSR の href は相対パスになるので、押して行き先を見る。
		await expect(page.getByRole('link', { name: '予想をまとめて見る' })).toBeVisible();
		await page.getByRole('link', { name: 'ふりかえりを書く' }).click();
		await expect(page).toHaveURL(`/races/${PAST_EMPTY_RACE_ID}`);
	});
});

/**
 * 送信中は保存ボタンを押せない。送信中に書き足した分は届いていないので、
 * 保存が通っても未保存のまま数え、画面からも消さない。
 *
 * **本当に保存させる。** 保存が通ると load が送った値を返し、欄がその値で描き直される。
 * 書き足した分が消えるのはこの経路なので、応答を差し替えると確かめられない。
 * POST だけを止めておき、その間に書き足す。
 */
test('送信中はボタンを押せず、その間に書き足した分は保存後も画面と未保存に残る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${EMPTY_RACE_ID}/preview`);

	let release = () => {};
	const released = new Promise<void>((r) => (release = r));
	await page.route(
		(url) => url.pathname === `/races/${EMPTY_RACE_ID}/preview`,
		async (route) => {
			if (route.request().method() !== 'POST') return route.fallback();
			await released;
			await route.continue();
		}
	);

	const body = page.locator('textarea[name="raceNoteBody"]');
	await body.fill('外差しが決まる馬場。');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();

	const pending = page.getByRole('button', { name: '保存しています…' });
	await expect(pending).toHaveAttribute('aria-disabled', 'true');
	await body.fill('外差しが決まる馬場。内は荒れている。');
	release();

	await expect(page.locator('[data-sonner-toast]')).toContainText('保存しました');
	await expect(body).toHaveValue('外差しが決まる馬場。内は荒れている。');
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();

	// 届いたのは送った時点の値だけ。
	await page.unroute((url) => url.pathname === `/races/${EMPTY_RACE_ID}/preview`);
	page.once('dialog', (d) => void d.accept()); // 読み込み直しは beforeunload の確認が出る
	await page.reload();
	await expect(body).toHaveValue('外差しが決まる馬場。');

	// 後片付け。空で保存すると消える仕様なので、それで元に戻す。
	await waitForHydration(page);
	await body.fill('');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();
	await expect(page.locator('[data-sonner-toast]')).toContainText('保存しました');
});

/** ブラウザの「戻る」でも止める。SvelteKit の中の履歴なら `beforeunload` は起きない。 */
test('書きかけのまま「戻る」を押しても、離れる前に確認が出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}`);
	// 読み込み直さずに予想画面へ（アプリ内の遷移）。
	await (await raceMenuItem(page, '予想（過去メモを見る）')).click();
	await expect(page).toHaveURL(`/races/${MARKS_RACE_ID}/preview`);

	const body = page.locator('textarea[name="raceNoteBody"]');
	await body.fill('外差しが決まる馬場。');

	const messages: string[] = [];
	page.once('dialog', (d) => {
		messages.push(d.message());
		void d.dismiss();
	});
	await page.goBack();
	await expect
		.poll(() => messages)
		.toEqual(['保存していない変更があります。保存せずにこのページを離れますか？']);
	await expect(page).toHaveURL(`/races/${MARKS_RACE_ID}/preview`);
	await expect(body).toHaveValue('外差しが決まる馬場。');
});

/**
 * 馬柱の帯（PC・タブレットだけ）。トグル「馬柱を表示」で、各馬の行に直近5走が横に並ぶ。
 * 設定は端末に残り（読み込み直しても ON）、もう一度押すと消える。スマホ（390px）ではトグルが見えない。
 * seed では E2Eプレビューホース の前走が E2E同条件賞（26/04/26・16頭中4着）。
 */
test('馬柱の帯は、トグルで出し入れでき、読み込み直しても残る', async ({ page }) => {
	await login(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);

	const toggle = page.getByRole('button', { name: '馬柱を表示' });
	const strip = page.getByRole('list', { name: 'E2Eプレビューホースの馬柱（直近5走）' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(strip).toBeHidden();

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	// 前走のマス（新しい順の先頭）に日付と着順が出る。縦の表は詳細情報の中に残る。
	const latest = strip.getByRole('listitem').first();
	await expect(latest).toContainText('26/04/26');
	await expect(latest).toContainText('4/16');

	await page.reload();
	await waitForHydration(page);
	await expect(page.getByRole('button', { name: '馬柱を表示' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(strip).toBeVisible();

	await page.getByRole('button', { name: '馬柱を表示' }).click();
	await expect(strip).toBeHidden();

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole('button', { name: '馬柱を表示' })).toBeHidden();
});
