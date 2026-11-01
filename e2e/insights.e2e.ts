import { expect, test, type Locator, type Page } from '@playwright/test';
import { failNextAction } from './action-failure';
import { gotoHydrated } from './hydration';
import { expectLinkTo } from './link';
import { login } from './login';
import { INSIGHT, PREVIEW_RACE_ID, THIS_WEEK_RACES } from './seed';

/*
 * レース直後の気づき（Issue #236）。
 *
 * 書き換えるのは `INSIGHT.write` のレース（出走2頭）と、言葉の登録専用のユーザーだけ。
 * 画面カタログが読む見本（`INSIGHT.view`）には書かない。このファイルのテストは順に走り、終わりに元へ戻す。
 */
test.describe.configure({ mode: 'serial' });

const writePath = `/races/${INSIGHT.write.raceId}`;
const row = (page: Page, entryId: string) => page.locator(`#entry-${entryId}`);
const aka = (page: Page) => row(page, INSIGHT.write.entries.aka);
const ao = (page: Page) => row(page, INSIGHT.write.entries.ao);

/** 閉じている「気づき」の開け閉めのボタン（空なら「＋ 気づき」、あれば付けた言葉）を押して開く。 */
const open = (r: Locator) => r.getByRole('button', { name: /(＋ 気づき|の気づきを開く)/ }).click();
const word = (r: Locator, name: string) => r.getByRole('button', { name: new RegExp(name) });
const memoBox = (r: Locator) => r.getByRole('textbox', { name: /の気づき$/ });
const status = (r: Locator) => r.getByRole('status');

test('言葉を登録・削除できる。重複と長すぎる言葉は文で断り、消しても付けた記録は残ると案内する', async ({
	page
}) => {
	await login(page, 'words-edit');
	await gotoHydrated(page, '/settings/insight-words');
	await expect(page.getByRole('heading', { name: '気づきの言葉' })).toBeVisible();
	await expect(page.getByText('言葉を削除しても、これまで付けた気づきは残ります。')).toBeVisible();
	await expect(page.getByText('まだ登録した言葉がありません')).toBeVisible();

	const input = page.getByLabel('新しい言葉');
	await input.fill('　Ｅ２Ｅ登録語 ');
	await page.getByRole('button', { name: '登録する' }).click();
	// 全角は半角に寄せ、前後の空白は除く。
	const list = page.getByRole('list');
	await expect(list.getByText('E2E登録語', { exact: true })).toBeVisible();

	await input.fill('E2E登録語');
	await page.getByRole('button', { name: '登録する' }).click();
	await expect(page.getByRole('alert')).toContainText('すでに登録されています');

	await input.evaluate((el) => el.removeAttribute('maxlength'));
	await input.fill('あ'.repeat(21));
	await page.getByRole('button', { name: '登録する' }).click();
	await expect(page.getByRole('alert')).toContainText('20文字以内');

	await page.getByRole('button', { name: /削除\s*（E2E登録語）/ }).click();
	await expect(page.getByText('まだ登録した言葉がありません')).toBeVisible();
});

test('言葉を押すと保存され、再読み込みしても付いていて、もう一度押すと外れる。本文の保存ボタンは出ない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await open(aka(page));

	const maegakabe = word(aka(page), '前が壁');
	await maegakabe.click();
	await expect(maegakabe).toHaveAttribute('aria-pressed', 'true');
	await expect(status(aka(page))).toHaveText('保存しました');

	// 気づきはふりかえり本文の入力とは別。未保存の件数も保存ボタンも出ず、本文の欄は空のまま。
	await expect(page.getByText(/未保存の変更が/)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'まとめて保存' })).toHaveCount(0);
	await expect(page.locator(`textarea[name="body.${INSIGHT.write.entries.aka}"]`)).toHaveValue('');

	await page.reload();
	await expect(aka(page).getByRole('button', { name: /の気づきを開く/ })).toContainText('前が壁');
	await gotoHydrated(page, writePath);
	await open(aka(page));
	await expect(word(aka(page), '前が壁')).toHaveAttribute('aria-pressed', 'true');

	// 2つ目の言葉も付けられる（複数）。
	await word(aka(page), '内詰まり').click();
	await expect(word(aka(page), '内詰まり')).toHaveAttribute('aria-pressed', 'true');
	await expect(status(aka(page))).toHaveText('保存しました');

	// もう一度押すと外れる。
	await word(aka(page), '前が壁').click();
	await expect(word(aka(page), '前が壁')).toHaveAttribute('aria-pressed', 'false');
	await word(aka(page), '内詰まり').click();
	await expect(status(aka(page))).toHaveText('保存しました');

	await page.reload();
	await expect(aka(page).getByRole('button', { name: /＋ 気づき/ })).toBeVisible();
});

test('自由入力のメモは保存ボタンなしで自動保存され、離れて戻っても残る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await open(aka(page));

	await memoBox(aka(page)).fill('前が壁になった。2400 なら。');
	// 保存ボタンを押さずに、アプリ内のリンクで離れる（離れる前に未送信のものを送り始める）。
	await aka(page).getByRole('link', { name: '言葉を登録・編集する' }).click();
	await expect(page).toHaveURL('/settings/insight-words');
	await page.goBack();

	await expect(aka(page).getByRole('button', { name: /の気づきを開く/ })).toContainText(
		'前が壁になった。2400 なら。'
	);
	await expect(page.getByText(/未保存の変更が/)).toHaveCount(0);

	// 後片付け: 空にすると、言葉も無いので気づきごと消える。
	await gotoHydrated(page, writePath);
	await open(aka(page));
	await memoBox(aka(page)).fill('');
	await memoBox(aka(page)).blur();
	await expect(status(aka(page))).toHaveText('保存しました');
	await page.reload();
	await expect(aka(page).getByRole('button', { name: /＋ 気づき/ })).toBeVisible();
});

test('ふりかえりを保存しても、空で保存し直しても、残した気づきは消えない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await open(ao(page));
	await word(ao(page), '前残り').click();
	await expect(status(ao(page))).toHaveText('保存しました');

	const raceNote = page.locator('textarea[name="raceNoteBody"]');
	await raceNote.fill('E2E 気づきの確認用。');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.locator('[data-sonner-toast]', { hasText: '保存しました' })).toBeVisible();

	// 本文を空にして保存し直す（レースのメモを消す）。
	await raceNote.fill('');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(
		page.locator('[data-sonner-toast]', { hasText: '保存しました' }).last()
	).toBeVisible();

	await page.reload();
	// 気づきはふりかえり本文に混ざらない（本文の欄は空のまま）。
	await expect(page.locator(`textarea[name="body.${INSIGHT.write.entries.ao}"]`)).toHaveValue('');
	await expect(ao(page).getByRole('button', { name: /の気づきを開く/ })).toContainText('前残り');

	// 後片付け。
	await gotoHydrated(page, writePath);
	await open(ao(page));
	await word(ao(page), '前残り').click();
	await expect(status(ao(page))).toHaveText('保存しました');
});

test('保存に失敗したら文と「もう一度保存する」が出て、押した言葉とメモは消えず、再試行で保存される', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await open(ao(page));
	await memoBox(ao(page)).fill('E2E 失敗のメモ');

	await failNextAction(page, `${writePath}/insights`, {
		message: '気づきの保存を確認できませんでした。時間をおいてもう一度試してください。',
		entryId: INSIGHT.write.entries.ao
	});
	await word(ao(page), '途中で諦めた').click();

	await expect(ao(page).getByRole('alert')).toContainText(
		'気づきの保存を確認できませんでした。時間をおいてもう一度試してください。入力は端末に残っています。'
	);
	// 押した言葉もメモも残っている。保存済みには見せない。
	await expect(word(ao(page), '途中で諦めた')).toHaveAttribute('aria-pressed', 'true');
	await expect(memoBox(ao(page))).toHaveValue('E2E 失敗のメモ');

	await ao(page)
		.getByRole('button', { name: /もう一度保存する/ })
		.click();
	await expect(status(ao(page))).toHaveText('保存しました');
	await expect(ao(page).getByRole('alert')).toHaveCount(0);

	await page.reload();
	await expect(ao(page).getByRole('button', { name: /の気づきを開く/ })).toContainText(
		'途中で諦めた'
	);
	await expect(ao(page).getByRole('button', { name: /の気づきを開く/ })).toContainText(
		'E2E 失敗のメモ'
	);

	// 後片付け。
	await gotoHydrated(page, writePath);
	await open(ao(page));
	await word(ao(page), '途中で諦めた').click();
	await memoBox(ao(page)).fill('');
	await memoBox(ao(page)).blur();
	await expect(status(ao(page))).toHaveText('保存しました');
});

test('失敗したまま再読み込みしても、入力は端末から戻り、自動では送らず、再試行で保存される', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, writePath);
	await open(ao(page));
	await failNextAction(page, `${writePath}/insights`, {
		message: 'x',
		entryId: INSIGHT.write.entries.ao
	});
	await word(ao(page), '前残り').click();
	await expect(ao(page).getByRole('alert')).toBeVisible();

	// 再読み込みしたあと、/insights への POST が飛ばないことを数える（復元は明示操作まで送らない）。
	const posts: string[] = [];
	page.on('request', (req) => {
		if (req.method() === 'POST' && req.url().endsWith(`${writePath}/insights`))
			posts.push(req.url());
	});
	await page.reload();
	await expect(ao(page).getByRole('alert')).toContainText('入力は端末に残っています');
	// 画面を離れる前の送信（pagehide）や online でも送られない。少し待って数える。
	await page.waitForTimeout(1500);
	expect(posts).toHaveLength(0);
	await expect(ao(page).getByRole('button', { name: /の気づきを開く/ })).toContainText('前残り');

	await ao(page)
		.getByRole('button', { name: /もう一度保存する/ })
		.click();
	await expect(ao(page).getByRole('alert')).toHaveCount(0);
	expect(posts).toHaveLength(1);

	// 後片付け。
	await open(ao(page));
	await word(ao(page), '前残り').click();
	await expect(status(ao(page))).toHaveText('保存しました');
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
	// 言葉無しユーザーが1頭目に残した気づきは、一般ユーザーの画面にも馬の画面にも出ない。
	await login(page);
	await gotoHydrated(page, writePath);
	await expect(page.getByText(INSIGHT.write.otherMemo)).toHaveCount(0);
	await expect(page.getByText('他人の言葉')).toHaveCount(0);
	await expect(aka(page).getByRole('button', { name: /＋ 気づき/ })).toBeVisible();
});

test('言葉を1つも登録していないユーザーには、登録の案内が出る。見本のレースの気づきは出ない', async ({
	page
}) => {
	await login(page, 'no-words');
	await gotoHydrated(page, writePath);
	await open(ao(page));
	await expect(ao(page).getByText('よく使う言葉を登録すると、押すだけで残せます。')).toBeVisible();
	await expect(ao(page).getByRole('link', { name: '言葉を登録する' })).toBeVisible();
	// 自由入力は使える。
	await expect(memoBox(ao(page))).toBeVisible();

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

test('当日のレースの予想画面から、気づき・ふりかえりへ入れる。開催前のレースには出さない', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${THIS_WEEK_RACES.upcoming.id}/preview`);
	await expectLinkTo(
		page.getByRole('link', { name: 'レースを見終えたら → 気づき・ふりかえりを残す' }),
		`/races/${THIS_WEEK_RACES.upcoming.id}`
	);

	await gotoHydrated(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await expect(page.getByRole('link', { name: /レースを見終えたら/ })).toHaveCount(0);
});

test('直接送っても、開催前のレースは 400、別のレースの出走馬は 404 で断る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/');
	const origin = new URL(page.url()).origin;
	const toggle = (entryId: string) => JSON.stringify({ entryId, word: '前が壁', on: true });

	// 開催前のレース（予想画面のレース）の出走馬。
	const upcoming = await page.request.post(`/races/${PREVIEW_RACE_ID}/insights`, {
		form: { toggle: toggle('01JE2EENTRYPREVIEW00000000') },
		headers: { origin },
		maxRedirects: 0
	});
	expect(upcoming.status()).toBe(400);

	// 別のレースの出走馬（書くレースに、見本のレースの出走馬を指す）。
	const other = await page.request.post(`${writePath}/insights`, {
		form: { toggle: toggle('01JE2EENTRYINSIGHTV1000000') },
		headers: { origin },
		maxRedirects: 0
	});
	expect(other.status()).toBe(404);

	// 言葉が長すぎれば検証で断る。
	const long = await page.request.post(`${writePath}/insights`, {
		form: {
			toggle: JSON.stringify({
				entryId: INSIGHT.write.entries.aka,
				word: 'あ'.repeat(21),
				on: true
			})
		},
		headers: { origin }
	});
	expect(await long.text()).toContain('20文字以内');
});

test.describe('JavaScript が無いとき', () => {
	test.use({ javaScriptEnabled: false });

	test('言葉のボタンとメモの保存ボタンがそのまま送信ボタンになり、結果の画面から戻れる', async ({
		page
	}) => {
		await login(page);
		await page.goto(writePath);

		// 言葉を付ける。
		await word(ao(page), '内詰まり').click();
		await expect(page.getByRole('status')).toHaveText('保存しました');
		await expectLinkTo(
			page.getByRole('link', { name: 'ふりかえりに戻る' }),
			`${writePath}#entry-${INSIGHT.write.entries.ao}`
		);

		// 戻ると付いている。メモを書いて、この馬のメモを保存する。
		await page.goto(writePath);
		await expect(word(ao(page), '内詰まり')).toHaveAttribute('aria-pressed', 'true');
		await memoBox(ao(page)).fill('E2E JS 無しのメモ');
		await ao(page).getByRole('button', { name: 'この馬のメモを保存する' }).click();
		await expect(page.getByRole('status')).toHaveText('保存しました');

		await page.goto(writePath);
		await expect(memoBox(ao(page))).toHaveValue('E2E JS 無しのメモ');

		// 後片付け（外して、メモを空にする）。
		await word(ao(page), '内詰まり').click();
		await page.goto(writePath);
		await memoBox(ao(page)).fill('');
		await ao(page).getByRole('button', { name: 'この馬のメモを保存する' }).click();
		await page.goto(writePath);
		await expect(word(ao(page), '内詰まり')).toHaveAttribute('aria-pressed', 'false');
		await expect(memoBox(ao(page))).toHaveValue('');
	});
});
