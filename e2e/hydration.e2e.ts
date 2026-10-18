import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration';
import { login } from './login';
import { BRACKET_RACE_ID, GRADED_RACE, JOCKEYS, PAST_EMPTY_RACE_ID, PREVIEW_RACE_ID } from './seed';

/**
 * **hydration の前に書いた値は、hydration のあとも残る。**
 *
 * Svelte は hydration で入力欄を SSR の値に合わせにいくので、そのままでは JS が届く前に
 * 書いたものが消える。`src/app.html` が覚えておき、ルートレイアウトが書き戻す
 * （`src/lib/utils/early-input.ts`）。電波の悪い競馬場で JS が遅れて届く場面を、
 * JS の配信を止めて作る。
 *
 * **保存はしない。** レースのメモは1人・1レースに1行なので、並列で走る
 * races.e2e.ts と同じ行を取り合うことになる。
 */

/** JS の配信を止めて開く。load は来ないので、DOM ができたところで返る。戻り値で配信を再開する。 */
async function openWithoutJs(page: Page, path: string) {
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await held;
		await route.continue();
	});
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	return release;
}

test('hydration 前に書いた本文は残り、未保存に数えられる', async ({ page }) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${PAST_EMPTY_RACE_ID}`);

	const body = page.locator('textarea[name="raceNoteBody"]');
	await body.fill('hydration の前に書いた。');
	await expect(page.locator('html')).not.toHaveAttribute('data-hydrated');

	release();
	await waitForHydration(page);
	await expect(body).toHaveValue('hydration の前に書いた。');
	// 書き戻した値は「保存済み」ではなく「未保存」。保存し忘れに気づける。
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();

	// あとから書いたものも、そのまま残る（書き戻しが後から上書きしない）。
	await body.fill('hydration のあとに書いた。');
	await page.waitForTimeout(500);
	await expect(body).toHaveValue('hydration のあとに書いた。');
});

/**
 * 予想画面の本文は `bind:value`（`Textarea`）なので、hydration では消えない。
 * そのぶん `DraftKeeper` が書いた値を「保存済み」と読みやすい。未保存に数えられることを見る。
 */
test('予想画面でも、hydration 前に書いた見立ては未保存に数えられる', async ({ page }) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${PREVIEW_RACE_ID}/preview`);

	const body = page.locator('textarea[name="raceNoteBody"]');
	await body.fill('hydration の前に書いた見立て。');

	release();
	await waitForHydration(page);
	await expect(body).toHaveValue('hydration の前に書いた見立て。');
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
});

test('hydration 前は開くボタンが押せず、hydration 後に押すと書ける', async ({ page }) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${BRACKET_RACE_ID}`);

	// races.e2e.ts がソトワクに書くので、ウチワクの行で見る。
	const row = page.locator('form li[id^="entry-"]', { hasText: 'E2Eウチワク' });
	const opener = row.getByRole('button', { name: /(出走前|ふりかえり)メモ/, expanded: false });
	// 押しても何も起きないボタンは、押せない状態で届く。入力欄は隠れたまま。
	await expect(opener).toBeDisabled();
	await expect(row.locator('textarea')).toBeHidden();

	release();
	await waitForHydration(page);
	await expect(opener).toBeEnabled();
	await opener.click();
	await expect(row.locator('textarea')).toBeFocused();
});

test('hydration 前に付け替えた印は残る', async ({ page }) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${PREVIEW_RACE_ID}/preview`);

	// seed では ◎。△ → ▲ → △ と迷ってから決める。触った順ではなく、最後に選んだものが残る。
	const marks = page.getByRole('radiogroup', { name: /予想印/ }).first();
	await expect(marks.getByRole('radio', { name: '◎' })).toBeChecked();
	for (const m of ['△', '▲', '△']) await marks.getByText(m, { exact: true }).click();

	release();
	await waitForHydration(page);
	await expect(marks.getByRole('radio', { name: '△' })).toBeChecked();
	await expect(marks.getByRole('radio', { name: '◎' })).not.toBeChecked();
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
	// 閉じた行の見出しの印も、書き戻した印に追従する。
	const row = page.locator('li[id^="entry-"]');
	await expect(row.getByTitle('予想印 △')).toBeVisible();
	await expect(row.getByTitle('予想印 ◎')).toHaveCount(0);
});

test('タブは hydration の前から描かれ、hydration でも出走馬の一覧が下へずれない', async ({
	page
}) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${PREVIEW_RACE_ID}/preview`);
	await expect(page.getByRole('tablist', { name: 'レースの表示' })).toBeVisible();
	const row = page.locator('li[id^="entry-"]').first();
	const before = (await row.boundingBox())!.y;

	release();
	await waitForHydration(page);
	await expect(page.getByRole('tab', { name: 'レース情報', exact: true })).toBeVisible();
	expect((await row.boundingBox())!.y).toBeCloseTo(before, 0);
});

/**
 * 騎手のまとめと重賞の傾向の書く欄は `<details>`。`bind:open` にすると、hydration が状態の値（閉）を
 * 要素に書き込み、JS が届く前に開いた欄が閉じる。開いたままのこと、読む形が隠れること（`editing` が
 * 要素に追従したこと）を見る。保存はしない（ファイル冒頭の約束）。
 */
for (const [label, path] of [
	['騎手のまとめ', `/jockeys/${encodeURIComponent(JOCKEYS.main)}`],
	['重賞の傾向', `/graded-races/${encodeURIComponent(GRADED_RACE.key)}`]
] as const) {
	test(`${label}の書く欄は、hydration の前に開いても hydration のあとに開いたまま`, async ({
		page
	}) => {
		await login(page);
		const release = await openWithoutJs(page, path);

		const details = page.locator('main details');
		// 読む形は、欄の前の兄弟要素。閉じている間は出ている。
		const reading = details.locator('xpath=preceding-sibling::*');
		await expect(reading).not.toHaveCount(0);
		await details.locator('summary').click();
		await expect(details).toHaveJSProperty('open', true);
		await expect(page.locator('html')).not.toHaveAttribute('data-hydrated');

		release();
		await waitForHydration(page);
		await expect(details).toHaveJSProperty('open', true);
		await expect(details.locator('textarea[name="body"]')).toBeVisible();
		await expect(reading).toHaveCount(0);
	});
}
