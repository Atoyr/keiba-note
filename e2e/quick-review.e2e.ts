import { expect, test, type Page } from '@playwright/test';
import { failNextAction, succeedAction } from './action-failure';
import { gotoHydrated } from './hydration';
import { expectLinkTo } from './link';
import { login } from './login';
import {
	ACTUAL_FLOW_18_RACE_ID,
	INSIGHT,
	MARKS_RACE_ID,
	PAST_EMPTY_RACE_ID,
	PREVIEW_RACE_ID,
	THIS_WEEK_RACES
} from './seed';

/*
 * ふりかえりのクイック入力（Issue #236 の気づきを作り直したもの）。
 *
 * 言葉を押すと、その馬のふりかえりメモの本文に入る。書き換えるのは `INSIGHT.write` のレース（出走2頭）と、
 * 言葉の登録専用のユーザーだけ。画面カタログが読む見本（`INSIGHT.view`）には書かない。
 * このファイルのテストは順に走り、保存したメモと登録した言葉は終わりに元へ戻す。
 */
test.describe.configure({ mode: 'serial' });

const writePath = `/races/${INSIGHT.write.raceId}`;
const { aka, ao } = INSIGHT.write.entries;
/** クイック入力の1行。 */
const row = (page: Page, entryId: string) => page.locator(`#quick-${entryId}`);
const toggle = (page: Page, entryId: string) => row(page, entryId).locator('button[aria-expanded]');
const word = (page: Page, entryId: string, name: string) =>
	row(page, entryId).getByRole('button', { name: new RegExp(`${name}$`) });
const body = (page: Page, entryId: string) => page.locator(`textarea[name="body.${entryId}"]`);
const quickButton = (page: Page) => page.getByRole('button', { name: 'クイック入力' });
const heading = (page: Page) => page.getByRole('heading', { name: 'クイック入力' });
/** 上に貼り付く帯の「ふりかえりに戻る」（ghost）。 */
const back = (page: Page) => page.getByRole('button', { name: 'ふりかえりに戻る' }).first();
/** 下に貼り付く帯の「ふりかえりに戻る」（塗り）。 */
const bandBack = (page: Page) => page.getByRole('button', { name: 'ふりかえりに戻る' }).last();
/** 下に貼り付く帯の状態の文（保存中… / 保存しました / N頭を保存できませんでした）。行の状態の行より後ろにある。 */
const band = (page: Page) => page.locator('.quick-review').getByRole('status').last();
const saveBar = (page: Page) => page.getByRole('button', { name: 'まとめて保存' });
const unsavedCount = (page: Page) => page.getByText(/未保存の変更が/);
const reviewTab = (page: Page) => page.getByRole('tab', { name: 'ふりかえり' });

/** 本文の欄に値を入れる（欄は閉じた行の中にあるので、下書きの書き戻しと同じく input を投げる）。 */
async function setBody(page: Page, entryId: string, value: string) {
	await body(page, entryId).evaluate((el, v) => {
		(el as HTMLTextAreaElement).value = v;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
}

/** 自動保存の送り先へ直接送って、馬の本文を元（空）に戻す。後片付け用。 */
async function clearBodies(page: Page, ...entryIds: string[]) {
	await page.evaluate(
		async ([path, ids]) => {
			for (const id of ids) {
				const body = new FormData();
				body.set('entryId', id);
				body.set('body', '');
				await fetch(`${path}?/quick`, {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				});
			}
		},
		[writePath, entryIds] as const
	);
}

test('言葉を登録・削除できる。重複と長すぎる言葉は文で断り、消してもメモに入れた文は消えないと案内する', async ({
	page
}) => {
	await login(page, 'words-edit');
	await gotoHydrated(page, '/settings/insight-words');
	await expect(page.getByRole('heading', { name: 'クイック入力の言葉' })).toBeVisible();
	await expect(page.getByText('言葉を削除しても、メモに入れた文は消えません。')).toBeVisible();
	await expect(page.getByText('まだ登録した言葉がありません')).toBeVisible();

	const input = page.getByLabel('新しい言葉');
	await input.fill('　Ｅ２Ｅ登録語 ');
	await page.getByRole('button', { name: '登録する', exact: true }).click();
	// 全角は半角に寄せ、前後の空白は除く。
	const list = page.getByRole('region', { name: /登録した言葉/ });
	await expect(list.getByText('E2E登録語', { exact: true })).toBeVisible();

	await input.fill('E2E登録語');
	await page.getByRole('button', { name: '登録する', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('すでに登録されています');

	await input.evaluate((el) => el.removeAttribute('maxlength'));
	await input.fill('あ'.repeat(21));
	await page.getByRole('button', { name: '登録する', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('20文字以内');

	await page.getByRole('button', { name: /削除\s*（E2E登録語）/ }).click();
	await expect(page.getByText('まだ登録した言葉がありません')).toBeVisible();
});

/** 設定画面で、登録した言葉を全部消す（words-edit の後片付け）。 */
async function clearWords(page: Page) {
	await gotoHydrated(page, '/settings/insight-words');
	const words = await page
		.getByRole('region', { name: /登録した言葉/ })
		.locator('li > span')
		.allTextContents();
	await page.evaluate(async (ws) => {
		for (const w of ws) {
			const body = new FormData();
			body.set('word', w);
			await fetch('/settings/insight-words?/remove', { method: 'POST', body });
		}
	}, words);
	await page.reload();
	await expect(page.getByText('まだ登録した言葉がありません')).toBeVisible();
}

test('おすすめの言葉を1つずつ・まとめて登録でき、登録したものはおすすめの節から消える', async ({
	page
}) => {
	await login(page, 'words-edit');
	await gotoHydrated(page, '/settings/insight-words');
	const defaults = page.getByRole('region', { name: 'おすすめの言葉' });
	const registered = page.getByRole('region', { name: /登録した言葉/ });
	await expect(defaults).toBeVisible();

	await defaults.getByRole('button', { name: /^前が壁\s*を登録する$/ }).click();
	await expect(registered.getByText('前が壁', { exact: true })).toBeVisible();
	await expect(defaults.getByRole('button', { name: /^前が壁\s*を登録する$/ })).toHaveCount(0);
	await expect(defaults.getByRole('button', { name: 'まとめて登録する（12個）' })).toBeVisible();

	await defaults.getByRole('button', { name: /まとめて登録する/ }).click();
	await expect(page.getByText('おすすめの言葉を12個登録しました')).toBeVisible();
	await expect(registered.getByText('次走注目', { exact: true })).toBeVisible();
	await expect(page.getByRole('region', { name: 'おすすめの言葉' })).toHaveCount(0);
	await expect(registered.getByRole('heading')).toContainText('13/30');

	await clearWords(page);
});

test('上限に近いときは、おすすめのまとめて登録が入る分だけ入り、上限の文を出す', async ({
	page
}) => {
	await login(page, 'words-edit');
	await gotoHydrated(page, '/settings/insight-words');
	// 直接送って28個まで詰める（おすすめと重ならない言葉）。
	await page.evaluate(async () => {
		for (let i = 1; i <= 28; i++) {
			const body = new FormData();
			body.set('word', `詰め${i}`);
			await fetch('/settings/insight-words?/add', { method: 'POST', body });
		}
	});
	await page.reload();
	await page.getByRole('button', { name: /まとめて登録する/ }).click();
	await expect(page.getByText(/上限（30個）に達したため、残りは登録していません/)).toBeVisible();
	await expect(page.getByRole('heading', { name: /登録した言葉（30\/30）/ })).toBeVisible();
	await expect(page.getByText('上限（30個）に達しています。')).toBeVisible();
	await expect(page.getByRole('button', { name: /まとめて登録する/ })).toHaveCount(0);

	await clearWords(page);
});

test('入口を押すとクイック入力に切り替わり、言葉を押すと自動で保存される。戻ると行のメモに入っていて、保存ボタンを押さなくても再読み込みで残る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	const url = page.url();
	await quickButton(page).click();
	await expect(heading(page)).toBeFocused();
	await expect(reviewTab(page)).toBeHidden();
	// 何も押していないうちは「保存しました」を出さない。
	await expect(band(page)).toHaveText('言葉を選ぶと自動で保存します');

	await toggle(page, ao).click();
	await word(page, ao, '前が壁').click();
	await word(page, ao, '内詰まり').click();
	await expect(word(page, ao, '前が壁')).toHaveAttribute('aria-pressed', 'true');
	await expect(body(page, ao)).toHaveValue('前が壁、内詰まり');
	await expect(band(page)).toHaveText('保存しました');
	await expect(row(page, ao).getByRole('status')).toHaveText('保存しました');
	// クイック入力のあいだは保存ボタンも未保存の件数も出さない。
	await expect(saveBar(page)).toHaveCount(0);
	await expect(unsavedCount(page)).toHaveCount(0);

	await bandBack(page).click();
	await expect(heading(page)).toBeHidden();
	expect(page.url()).toBe(url);
	await expect(page.locator(`#entry-${ao}`)).toContainText('前が壁、内詰まり');
	// 保存済みなので、未保存には数えない。
	await expect(saveBar(page)).toHaveCount(0);
	await expect(unsavedCount(page)).toHaveCount(0);
	await expect(quickButton(page)).toBeFocused();

	await page.reload();
	await expect(body(page, ao)).toHaveValue('前が壁、内詰まり');

	// 外すと、外した結果も自動で保存される。
	await gotoHydrated(page, writePath);
	await quickButton(page).click();
	await toggle(page, ao).click();
	await word(page, ao, '前が壁').click();
	await word(page, ao, '内詰まり').click();
	await expect(body(page, ao)).toHaveValue('');
	await expect(band(page)).toHaveText('保存しました');
	await page.reload();
	await expect(body(page, ao)).toHaveValue('');
});

test('同じ馬の言葉を素早く押す・外す・押すと最後の値が保存され、2頭に続けて押しても両方残る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	// 送信を遅らせて、前の送信が終わる前に次を押す状況を作る。
	await page.route(
		(url) => url.pathname === writePath,
		async (route) => {
			if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 300));
			await route.fallback();
		}
	);
	await quickButton(page).click();
	await toggle(page, ao).click();
	await word(page, ao, '前が壁').click();
	await word(page, ao, '前が壁').click();
	await word(page, ao, '前が壁').click();
	await toggle(page, aka).click();
	await word(page, aka, '内詰まり').click();
	await expect(band(page)).toHaveText('保存しました');
	await expect(body(page, ao)).toHaveValue('前が壁');

	await page.reload();
	await expect(body(page, ao)).toHaveValue('前が壁');
	await expect(body(page, aka)).toHaveValue('内詰まり');

	await clearBodies(page, ao, aka);
	await page.reload();
	await expect(body(page, ao)).toHaveValue('');
	await expect(body(page, aka)).toHaveValue('');
});

test('保存に失敗しても入力は残り、クイック入力の中で再試行できる。戻ると未保存として数える', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await quickButton(page).click();
	await toggle(page, ao).click();
	await failNextAction(page, writePath, { message: '保存できません' });
	await word(page, ao, '前が壁').click();

	await expect(row(page, ao).getByRole('alert')).toHaveText('保存できませんでした。');
	await expect(band(page)).toHaveText('1頭を保存できませんでした');
	// 入力（✓・本文）は残る。「保存しました」は出ない。
	await expect(word(page, ao, '前が壁')).toHaveAttribute('aria-pressed', 'true');
	await expect(body(page, ao)).toHaveValue('前が壁');
	await expect(page.getByText('保存しました')).toHaveCount(0);
	// 閉じた行には「未保存」を字で出す。
	await toggle(page, ao).click();
	await expect(toggle(page, ao)).toContainText('未保存');
	await toggle(page, ao).click();

	await page.getByRole('button', { name: '再試行' }).click();
	await expect(band(page)).toHaveText('保存しました');
	await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
	await expect(row(page, ao).getByRole('status')).toHaveText('保存しました');

	await bandBack(page).click();
	await expect(heading(page)).toBeHidden();
	await page.reload();
	await expect(body(page, ao)).toHaveValue('前が壁');

	// 失敗のまま戻ると、未保存の件数が出て、一括でも保存できる。
	await quickButton(page).click();
	await toggle(page, ao).click();
	await failNextAction(page, writePath, { message: '保存できません' });
	await word(page, ao, '前が壁').click();
	await expect(band(page)).toHaveText('1頭を保存できませんでした');
	await bandBack(page).click();
	await expect(unsavedCount(page)).toContainText('1');
	await expect(saveBar(page)).toBeVisible();
	await saveBar(page).click();
	await expect(page.locator('[data-sonner-toast]', { hasText: '保存しました' })).toBeVisible();

	await clearBodies(page, ao);
	await page.reload();
	await expect(body(page, ao)).toHaveValue('');
});

test('書きかけのレースのメモ・ほかの馬の本文は保存されず、同じ馬の書きかけは言葉と一緒に保存される', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	const raceNote = page.locator('textarea[name="raceNoteBody"]');
	await raceNote.fill('E2E レースの書きかけ');
	await setBody(page, aka, 'E2E 別の馬の書きかけ');
	await setBody(page, ao, 'E2E 同じ馬の書きかけ。');

	await quickButton(page).click();
	await toggle(page, ao).click();
	// 書きかけのある馬には、開いた中に案内が出る（別の馬の書きかけにも、その馬の行の中に出る）。
	const hint = (entryId: string) =>
		row(page, entryId).getByText('ふりかえりで書きかけの本文があります。');
	await expect(hint(ao)).toBeVisible();
	await word(page, ao, '前が壁').click();
	await expect(body(page, ao)).toHaveValue('E2E 同じ馬の書きかけ。前が壁');
	await expect(band(page)).toHaveText('保存しました');
	// 保存したあとは、その馬の案内は出ない。
	await expect(hint(ao)).toHaveCount(0);

	await bandBack(page).click();
	await expect(raceNote).toHaveValue('E2E レースの書きかけ');
	await expect(body(page, aka)).toHaveValue('E2E 別の馬の書きかけ');
	await expect(unsavedCount(page)).toContainText('2');

	await page.reload();
	// 書きかけは localStorage の下書きに残る（復元を持ちかけられる）。サーバーに入ったのは同じ馬の分だけ。
	await expect(page.getByText('保存されていない下書きがあります')).toBeVisible();
	await expect(raceNote).toHaveValue('');
	await expect(body(page, aka)).toHaveValue('');
	await expect(body(page, ao)).toHaveValue('E2E 同じ馬の書きかけ。前が壁');
	await page.getByRole('button', { name: '破棄' }).click();

	await clearBodies(page, ao);
	await page.reload();
	await expect(body(page, ao)).toHaveValue('');
});

test('保存のあとも、クイック入力は開いたまま・開いている馬は開いたまま・スクロール位置は動かない', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page);
	await gotoHydrated(page, `/races/${ACTUAL_FLOW_18_RACE_ID}?quick`);
	// DB は変えない（18頭のレースは見本）。保存が通った応答を返す。
	await succeedAction(page, `/races/${ACTUAL_FLOW_18_RACE_ID}`, { quickSaved: 'x' });
	const rows = page.locator('main li[id^="quick-"]');
	await rows.nth(12).scrollIntoViewIfNeeded();
	const t = rows.nth(12).locator('button[aria-expanded]');
	await t.click();
	const before = await page.evaluate(() => window.scrollY);
	const ids = await rows.evaluateAll((els) => els.map((el) => el.id));

	await rows.nth(12).locator('button[aria-pressed]').first().click();
	await expect(band(page)).toHaveText('保存しました');
	await expect(heading(page)).toBeVisible();
	await expect(t).toHaveAttribute('aria-expanded', 'true');
	expect(await rows.evaluateAll((els) => els.map((el) => el.id))).toEqual(ids);
	expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(1);
	// 一覧の下まで来ても、下の帯の「ふりかえりに戻る」が画面の中にある。
	await expect(bandBack(page)).toBeInViewport();
	await bandBack(page).click();
	await expect(heading(page)).toBeHidden();
});

test('戻る操作は1回で効く。ふりかえりから開いたときも、?quick で開いたときも、ブラウザの戻るでも', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	const url = page.url();
	await succeedAction(page, writePath, { quickSaved: 'x' });

	await quickButton(page).click();
	await toggle(page, ao).click();
	await word(page, ao, '前が壁').click();
	await expect(band(page)).toHaveText('保存しました');
	await bandBack(page).click();
	await expect(heading(page)).toBeHidden();
	expect(page.url()).toBe(url);

	await quickButton(page).click();
	await expect(heading(page)).toBeVisible();
	await page.goBack();
	await expect(heading(page)).toBeHidden();
	expect(page.url()).toBe(url);
	await expect(reviewTab(page)).toBeVisible();

	await gotoHydrated(page, `${writePath}?quick`);
	await expect(heading(page)).toBeVisible();
	await bandBack(page).click();
	await expect(heading(page)).toBeHidden();
	await expect(reviewTab(page)).toBeVisible();
	await expect(page).not.toHaveURL(/quick/);
});

test('着順の並びで印が見え、「馬番」を押すと馬番順に並ぶ。読むだけで書かない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}?quick`);
	const rows = page.locator('main li[id^="quick-"]');
	await expect(rows).toHaveCount(7);
	const group = page.getByRole('group', { name: '並び順' });
	await expect(group.getByRole('button', { name: '着順' })).toHaveAttribute('aria-pressed', 'true');

	// 着順: ①1着 ⑤2着 ③3着 ⑥4着 ②5着 ④6着 ⑦なし。印は ◎○▲△☆× が付き、⑦は無し。
	const finish = ['1着', '2着', '3着', '4着', '5着', '6着'];
	for (const [i, f] of finish.entries()) await expect(rows.nth(i)).toContainText(f);
	await expect(rows.nth(0).getByTitle('予想印 ◎')).toBeVisible();
	await expect(rows.nth(6).getByTitle(/予想印/)).toHaveCount(0);

	await group.getByRole('button', { name: '馬番' }).click();
	await expect(group.getByRole('button', { name: '馬番' })).toHaveAttribute('aria-pressed', 'true');
	// 馬番順: ①1着 ②5着 ③3着 ④6着 ⑤2着 ⑥4着 ⑦なし。
	const byNumber = ['1着', '5着', '3着', '6着', '2着', '4着'];
	for (const [i, f] of byNumber.entries()) await expect(rows.nth(i)).toContainText(f);
	await expect(rows.nth(6)).not.toContainText('着');

	// 選びは次に開いても残る。後片付けとして着順に戻す。
	await gotoHydrated(page, `/races/${MARKS_RACE_ID}?quick`);
	await expect(group.getByRole('button', { name: '馬番' })).toHaveAttribute('aria-pressed', 'true');
	await group.getByRole('button', { name: '着順' }).click();
	await expect(rows.nth(1)).toContainText('2着');
});

test('本文に「伸びた。」があると「伸びた。前が壁」になり、押し直すと「伸びた。」に戻る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await setBody(page, aka, '伸びた。');
	await quickButton(page).click();
	await toggle(page, aka).click();
	await word(page, aka, '前が壁').click();
	await expect(body(page, aka)).toHaveValue('伸びた。前が壁');
	await word(page, aka, '前が壁').click();
	await expect(body(page, aka)).toHaveValue('伸びた。');
	await expect(band(page)).toHaveText('保存しました');

	// 後片付け: 言葉を押すと書きかけごと保存されるので、本文を空に戻す。
	await clearBodies(page, aka);
});

test('ブラウザの戻るでクイック入力が閉じ、同じページのまま、書いた本文が残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await setBody(page, aka, 'E2E 書きかけ');
	const url = page.url();
	await quickButton(page).click();
	await expect(heading(page)).toBeVisible();

	await page.goBack();
	await expect(heading(page)).toBeHidden();
	await expect(reviewTab(page)).toBeVisible();
	expect(page.url()).toBe(url);
	await expect(body(page, aka)).toHaveValue('E2E 書きかけ');
});

test('?quick で開くとクイック入力から始まり、戻るとふりかえりへ。URL に quick は残らない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `${writePath}?quick`);
	await expect(heading(page)).toBeVisible();
	await expect(page).not.toHaveURL(/quick/);

	await back(page).click();
	await expect(heading(page)).toBeHidden();
	await expect(reviewTab(page)).toBeVisible();
	await expect(page).not.toHaveURL(/quick/);
});

test('言葉が0個なら、クイック入力でおすすめをまとめて登録するとその場で言葉が並ぶ。先に打った本文は残る', async ({
	page
}) => {
	await login(page, 'words-edit');
	await gotoHydrated(page, writePath);
	await setBody(page, aka, '書きかけのふりかえり');
	await quickButton(page).click();
	await expect(
		page.getByText('よく使う言葉を登録すると、押すだけでメモに入れられます。')
	).toHaveCount(1);

	await page.getByRole('button', { name: 'おすすめの言葉をまとめて登録する' }).click();
	await expect(page.getByText('おすすめの言葉を13個登録しました')).toBeVisible();
	await expect(page.getByRole('button', { name: 'おすすめの言葉をまとめて登録する' })).toHaveCount(
		0
	);

	// 再読み込みなしで、言葉のボタンが並ぶ。
	await toggle(page, aka).click();
	await expect(word(page, aka, '前が壁')).toBeVisible();
	await expect(word(page, aka, '次走注目')).toBeVisible();
	await expect(heading(page)).toBeVisible();
	await expect(body(page, aka)).toHaveValue('書きかけのふりかえり');

	await clearWords(page);
});

test('別の馬を押すと前の馬が閉じ、押した行は画面の中に残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${ACTUAL_FLOW_18_RACE_ID}?quick`);
	const rows = page.locator('main li[id^="quick-"]');
	await expect(rows).toHaveCount(18);
	const t = (i: number) => rows.nth(i).locator('button[aria-expanded]');

	await t(2).click();
	await expect(t(2)).toHaveAttribute('aria-expanded', 'true');
	// 画面の真ん中に置く（開いた中が画面の下にはみ出さない位置。はみ出す場合の補正は下のテスト）。
	await rows.nth(11).evaluate((el) => el.scrollIntoView({ block: 'center' }));
	const top = () => rows.nth(11).evaluate((el) => el.getBoundingClientRect().top);
	const before = await top();
	await t(11).click();

	await expect(t(2)).toHaveAttribute('aria-expanded', 'false');
	await expect(t(11)).toHaveAttribute('aria-expanded', 'true');
	await expect(rows.nth(11)).toBeInViewport();
	await expect.poll(async () => Math.abs((await top()) - before)).toBeLessThanOrEqual(1);
});

test('18頭のうち下のほうの馬を開くと、最初の言葉のボタンが画面に入る', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await login(page);
	await gotoHydrated(page, `/races/${ACTUAL_FLOW_18_RACE_ID}?quick`);
	const rows = page.locator('main li[id^="quick-"]');
	await rows.nth(16).scrollIntoViewIfNeeded();
	await rows.nth(16).locator('button[aria-expanded]').click();
	await expect(rows.nth(16).locator('button[aria-pressed]').first()).toBeInViewport();
});

test('言葉の登録から戻ると、クイック入力のまま帰ってくる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await quickButton(page).click();
	await page.getByRole('link', { name: '言葉を登録・編集する' }).click();
	await expect(page).toHaveURL('/settings/insight-words');
	await page.goBack();
	await expect(heading(page)).toBeVisible();
});

test('出走馬が0頭のレースにはクイック入力の入口を出さない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}`);
	await expect(quickButton(page)).toHaveCount(0);
});

test('ふりかえりタブの行には言葉のボタンが出ない。以前に気づきを残した馬だけ、読むだけの言葉が出る', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${INSIGHT.view.raceId}`);
	await expect(reviewTab(page)).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('tab', { name: '気づき' })).toHaveCount(0);

	const shiro = page.locator('main li[id^="entry-"]', { hasText: INSIGHT.view.names.shiro });
	await expect(shiro.getByText('距離延長○', { exact: true })).toBeVisible();
	await expect(shiro.getByText(INSIGHT.view.memo)).toBeVisible();
	await expect(shiro.getByRole('button', { name: /距離延長○/ })).toHaveCount(0);

	// 気づきの無い馬の行には、何も足さない。
	await gotoHydrated(page, writePath);
	await expect(page.locator(`#entry-${aka} .insight-view`)).toHaveCount(0);
});

test('保存済みの気づきは、次走の検討（予想画面の過去走）と馬の画面で読める', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${INSIGHT.view.raceId}/preview`);
	const horse = page.locator('main li[id^="entry-"]', { hasText: INSIGHT.view.names.shiro });
	await horse.locator('summary', { hasText: '詳細情報（メモ・直近5走）' }).click();
	await expect(horse.getByText(INSIGHT.past.memo)).toBeVisible();
	await expect(horse.getByText('前が壁', { exact: true })).toBeVisible();

	await gotoHydrated(page, `/horses/${INSIGHT.view.horses.shiro}`);
	await expect(page.getByText(INSIGHT.past.memo)).toBeVisible();
	await expect(page.getByText(INSIGHT.view.memo)).toBeVisible();
	await expectLinkTo(
		page.getByRole('link', { name: /E2E気づき前走/ }),
		`/races/${INSIGHT.past.raceId}`
	);
});

test('予想まとめには気づきを出さない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${INSIGHT.view.raceId}/summary`);
	await expect(page.getByText(INSIGHT.view.memo)).toHaveCount(0);
	await expect(page.getByText('上がりが強い')).toHaveCount(0);
});

test('他人の気づきは見えない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await expect(page.getByText(INSIGHT.write.otherMemo)).toHaveCount(0);
});

test('言葉を1つも登録していないユーザーのクイック入力には、登録の案内が出る。見本のレースの気づきは出ない', async ({
	page
}) => {
	await login(page, 'no-words');
	await gotoHydrated(page, `${writePath}?quick`);
	await expect(
		page.getByText('よく使う言葉を登録すると、押すだけでメモに入れられます。')
	).toHaveCount(1);
	await expect(page.getByRole('link', { name: '言葉を登録する' })).toHaveCount(1);

	await gotoHydrated(page, `/horses/${INSIGHT.view.horses.shiro}`);
	await expect(page.getByText(INSIGHT.view.memo)).toHaveCount(0);
});

test('結果が入る前でも、気づきを残したレースは一覧からふりかえりへ向く。残していなければ予想画面', async ({
	page
}) => {
	const path = `/races/?year=2026&q=${encodeURIComponent(INSIGHT.noResult.name)}`;
	await login(page);
	await gotoHydrated(page, path);
	await expectLinkTo(
		page.getByRole('link', { name: new RegExp(INSIGHT.noResult.name) }),
		`/races/${INSIGHT.noResult.raceId}`
	);

	const other = await page.context().browser()!.newContext();
	const otherPage = await other.newPage();
	await login(otherPage, 'no-words');
	await gotoHydrated(otherPage, path);
	await expectLinkTo(
		otherPage.getByRole('link', { name: new RegExp(INSIGHT.noResult.name) }),
		`/races/${INSIGHT.noResult.raceId}/preview`
	);
	await other.close();
});

test('当日のレースの予想画面から、クイック入力へ入れる。開催前のレースには出さない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${THIS_WEEK_RACES.upcoming.id}/preview`);
	await expectLinkTo(
		page.getByRole('link', { name: 'レースを見終えたら → クイック入力でふりかえる' }),
		`/races/${THIS_WEEK_RACES.upcoming.id}?quick`
	);

	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await expect(page.getByRole('link', { name: /レースを見終えたら/ })).toHaveCount(0);
});

test.describe('JavaScript が無いとき', () => {
	test.use({ javaScriptEnabled: false });

	test('入口を出さず、?quick 付きでもふりかえりがそのまま出る', async ({ page }) => {
		await login(page);
		await page.goto(`${writePath}?quick`);
		await expect(quickButton(page)).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'クイック入力' })).toHaveCount(0);
		await expect(page.locator(`#entry-${aka}`)).toBeVisible();
	});
});
