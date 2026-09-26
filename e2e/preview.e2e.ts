import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
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
 * 馬柱の各走に、頭数・枠・馬番・騎手・勝ち馬とタイム差、タイム・通過順が2行目として出る。日付は YY/MM/DD。
 * seed では、この馬の前走（E2E同条件賞・4着）は16頭の3枠5番で、勝ち馬と 0.4 差、2:12.8 と 8-8-7-6。
 * 3走前（E2E霜月特別）は勝った走で、馬番・騎手と2着馬との差だけ（頭数・枠・タイム・通過順が無い）。
 */
test('馬柱の走に、頭数・枠・馬番・騎手・勝ち馬とタイム・通過順が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PREVIEW_RACE_ID}/preview`);

	// 同じ行の「自分の過去メモ」も ol > li でレース名を含むので、馬柱にだけ出る条件（芝2200m）で絞る
	const run = page
		.locator('main > form > ul > li')
		.first()
		.locator('ol > li', { hasText: 'E2E同条件賞' })
		.filter({ hasText: '芝2200m' });
	await expect(run).toContainText('26/04/26');
	await expect(run).toContainText('4着');
	await expect(run).toContainText('16頭 3枠5番');
	await expect(run).toContainText('騎手E2E騎手');
	// 負けた走は勝ち馬とのタイム差。2着馬は出さない
	await expect(run).toContainText('勝ち馬E2E勝ち馬（0.4）');
	await expect(run).not.toContainText('E2E2着馬');
	await expect(run).toContainText('タイム2:12.8');
	await expect(run).toContainText('通過順8-8-7-6');

	// 頭数・枠・タイム・通過順が入っていない走（E2E霜月特別）は、入っているものだけ出す
	const noTime = page
		.locator('main > form > ul > li')
		.first()
		.locator('ol > li', { hasText: 'E2E霜月特別' });
	await expect(noTime).toContainText('1着');
	await expect(noTime).toContainText('2番');
	// 勝った走は2着馬と、2着につけた差（負）
	await expect(noTime).toContainText('2着馬E2E霜月2着馬（-0.2）');
	await expect(noTime).not.toContainText('頭');
	await expect(noTime).not.toContainText('枠');
	// 読み上げ用の「タイム差」はあるので、「タイム」の直後に数字が続くかで見る
	await expect(noTime).not.toContainText(/タイム\d/);
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
	await page.getByRole('link', { name: '予想（過去メモを見る）' }).click();
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
