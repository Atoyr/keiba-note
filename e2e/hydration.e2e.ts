import { expect, test, type Page } from '@playwright/test';
import { waitForHydration } from './hydration';
import { login } from './login';
import { BRACKET_RACE_ID, PAST_EMPTY_RACE_ID, PREVIEW_RACE_ID } from './seed';

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

test('hydration 前に付けた札は残る', async ({ page }) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${BRACKET_RACE_ID}`);

	// races.e2e.ts がソトワクに書くので、ウチワクの行で見る。
	const row = page.locator('form li', { hasText: 'E2Eウチワク' });
	const tag = row.getByRole('checkbox', { name: '馬場向かず' });
	const rendered = await tag.isChecked();
	// 札は見た目だけのラベルで、チェックボックス本体は隠してある。押すのはラベル。
	await row.getByText('馬場向かず', { exact: true }).click();
	await expect(tag).toBeChecked({ checked: !rendered });

	release();
	await waitForHydration(page);
	await expect(tag).toBeChecked({ checked: !rendered });
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
});

test('hydration 前に付け替えた印は残る', async ({ page }) => {
	await login(page);
	const release = await openWithoutJs(page, `/races/${PREVIEW_RACE_ID}/preview`);

	// seed では ◎。△ → ▲ → △ と迷ってから決める。触った順ではなく、最後に選んだものが残る。
	const marks = page.getByRole('radiogroup', { name: '予想印' }).first();
	await expect(marks.getByRole('radio', { name: '◎' })).toBeChecked();
	for (const m of ['△', '▲', '△']) await marks.getByText(m, { exact: true }).click();

	release();
	await waitForHydration(page);
	await expect(marks.getByRole('radio', { name: '△' })).toBeChecked();
	await expect(marks.getByRole('radio', { name: '◎' })).not.toBeChecked();
	await expect(page.getByText('未保存の変更が 1 件あります')).toBeVisible();
});
