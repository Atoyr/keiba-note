import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated } from './hydration';
import { ROW_RACE, EMPTY_RACE_ID } from './seed';
import { failNextAction } from './action-failure';

async function login(page: Page) {
	await page.context().addCookies([
		{
			name: 'session',
			value: 'roweditorsessiontoken000000000000',
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Lax'
		}
	]);
}

const row = (page: Page, index: number) => page.locator(`#entry-${ROW_RACE.entries[index]}`);
/** 行の「その場で書く」ボタン（書いたメモそのもの、または「＋ 出走前メモ」「＋ ふりかえりメモ」）を押して、入力欄を出す。 */
const open = async (page: Page, index: number) =>
	row(page, index)
		.getByRole('button', { name: /(出走前|ふりかえり)メモ/ })
		.click();
/** 入力欄の「閉じる」。書いたメモの表示に戻る（保存でも破棄でもない）。 */
const done = async (page: Page, index: number) =>
	row(page, index)
		.getByRole('button', { name: /メモを\s*閉じる$/ })
		.click();
/** 行に見えているメモ（本文と札）。メモごとの塊は `EntryMemo` の `.entry-memo`。詳細情報の中は畳んでいるので数えない。 */
const memos = (page: Page, index: number) => row(page, index).locator('.entry-memo:visible');
const detail = (page: Page, index: number) =>
	row(page, index).locator('summary', { hasText: '詳細情報（メモ・直近5走）' });
const route = `/races/${ROW_RACE.id}/preview`;

test('行・詳細・タブ・並び順を往復し、閉じた馬とレースの入力も一括保存する', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, route);
	await expect(row(page, 0).locator('textarea')).toBeHidden();
	await open(page, 0);
	await row(page, 0).locator('textarea').fill('内で脚をためる。');
	await row(page, 0).getByRole('radio', { name: '◎', exact: true }).check({ force: true });
	await row(page, 0).getByRole('checkbox', { name: '次走買い' }).check({ force: true });
	await detail(page, 0).click();
	// 表の行（着順/頭数・枠-馬番）と、表の下の「各レースの過去メモ」は別のかたまり
	const run = row(page, 0).locator('tbody', { hasText: 'E2E行展開前走' });
	await expect(run.locator('tr').first().locator('td').nth(1)).toHaveText('4/18');
	await expect(run.locator('tr').first().locator('td').nth(2)).toHaveText('3-5');
	const pastNotes = row(page, 0)
		.locator('section')
		.filter({
			has: page.getByRole('heading', { name: '各レースの過去メモ（自分のメモ）' })
		});
	const pastNote = pastNotes.locator('li', { hasText: 'E2E行展開前走' });
	await expect(pastNote).toContainText('前走の出走前メモ');
	await expect(pastNote).toContainText('前走のふりかえりメモ');
	await expect(
		pastNote.getByRole('link', { name: 'この走りの画面でメモを確認・編集する' })
	).toHaveAttribute('href', '/races/01JE2ERACEROWPAST000000000');
	// 近況は走りに付けない（馬のメモの欄には出うるので、馬柱の表と各走のメモの中だけを見る）
	await expect(run).not.toContainText('近況はこの走りに付けない');
	await expect(pastNotes).not.toContainText('近況はこの走りに付けない');
	await expect(page.getByText('他人の各走メモ')).toHaveCount(0);
	await open(page, 1);
	await expect(row(page, 1).getByText('過去走の記録がありません。')).toBeHidden();
	await detail(page, 1).click();
	await expect(row(page, 1).getByText('過去走の記録がありません。')).toBeVisible();
	await row(page, 1).locator('textarea').fill('外から進出する。');
	await page.getByLabel('レースの見立て', { exact: true }).fill('先行有利。');
	await page.getByRole('button', { name: '人気順', exact: true }).click();
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	// 基本情報の表は無く、頭数と発走時刻は見出しにある。
	await expect(page.getByRole('region', { name: '基本情報' })).toHaveCount(0);
	await expect(page.locator('main p', { hasText: '18頭' }).first()).toContainText(
		'芝2000m / 左 / 18頭'
	);
	await expect(page.getByText('15:45発走')).toBeVisible();
	await expect(row(page, 1)).toBeHidden();
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（3 件）')).toBeVisible();
	// 保存が通ったら、開いていた入力欄は閉じて、書いたメモの表示に戻る（保存の前に切り替えた「予想」のタブへ戻って見る）。
	await page.getByRole('tab', { name: '予想', exact: true }).click();
	await expect(row(page, 0).locator('textarea')).toBeHidden();
	await expect(row(page, 1).locator('textarea')).toBeHidden();
	await expect(memos(page, 1)).toContainText('外から進出する。');
	await gotoHydrated(page, route);
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('内で脚をためる。');
	await expect(row(page, 0).getByRole('radio', { name: '◎', exact: true })).toBeChecked();
	await expect(row(page, 0).getByRole('checkbox', { name: '次走買い' })).toBeChecked();
	await open(page, 1);
	await expect(row(page, 1).locator('textarea')).toHaveValue('外から進出する。');
});

test('行を開かずに選んだ印は、保存前から見出しと「付けた印」に出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, route);
	// タブの並びはサーバーが描いた HTML にすでにある（hydration で出てきて一覧を押し下げない）。
	expect(await (await page.request.get(route)).text()).toContain('role="tablist"');
	const marks = page.getByRole('region', { name: '付けた印' });
	const name = ROW_RACE.names[1];
	await expect(row(page, 1).getByTitle('予想印 ◎')).toHaveCount(0);
	await expect(marks.getByText(name)).toHaveCount(0);
	// 印は常に出ているので、行を開かずに選べる。
	await expect(row(page, 1).getByRole('radiogroup', { name: /予想印/ })).toBeVisible();
	await row(page, 1).getByRole('radio', { name: '◎', exact: true }).check({ force: true });
	await expect(row(page, 1).locator('textarea')).toBeHidden();
	await expect(row(page, 1).getByTitle('予想印 ◎')).toBeVisible();
	await expect(row(page, 1)).toHaveClass(/ring-red-300/);
	await expect(marks.getByText(name)).toBeVisible();
	await row(page, 1).getByRole('radio', { name: 'なし', exact: true }).check({ force: true });
	await expect(row(page, 1).getByTitle('予想印 ◎')).toHaveCount(0);
	await expect(row(page, 1)).not.toHaveClass(/ring-red-300/);
	await expect(marks.getByText(name)).toHaveCount(0);
});

test('保存失敗→リロード→「復元する」で、閉じた行の見出しに下書きの印が出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, route);
	await row(page, 1).getByRole('radio', { name: '△', exact: true }).check({ force: true });
	await failNextAction(page, route, { message: '印の保存失敗' });
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByRole('alert')).toContainText('印の保存失敗');
	await page.waitForFunction(
		(entryId) =>
			Object.keys(localStorage).some(
				(key) =>
					key.includes('draft:preview') && localStorage.getItem(key)?.includes(`mark.${entryId}`)
			),
		ROW_RACE.entries[1]
	);
	page.on('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await expect(row(page, 1).getByTitle('予想印 △')).toHaveCount(0);
	await page.getByRole('button', { name: '復元する' }).click();
	await expect(row(page, 1).locator('textarea')).toBeHidden();
	await expect(row(page, 1).getByTitle('予想印 △')).toBeVisible();
	await expect(
		page.getByRole('region', { name: '付けた印' }).getByText(ROW_RACE.names[1])
	).toBeVisible();
});

test('保存失敗後の閉じた入力を端末の下書きから明示復元する', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, route);
	await open(page, 0);
	await row(page, 0).locator('textarea').fill('保存失敗時の下書き');
	await done(page, 0);
	await failNextAction(page, route, { message: '行展開テストの保存失敗' });
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByRole('alert')).toContainText('行展開テストの保存失敗');
	await page.waitForFunction(() =>
		Object.keys(localStorage).some(
			(key) =>
				key.includes('draft:preview') && localStorage.getItem(key)?.includes('保存失敗時の下書き')
		)
	);
	page.on('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await expect(page.getByRole('button', { name: '復元する' })).toBeVisible();
	await page.getByRole('button', { name: '復元する' }).click();
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('保存失敗時の下書き');
});

test('ふりかえりの閉じた行も保存し、事前の予想を上書きしない', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${ROW_RACE.id}`);
	await expect(row(page, 0)).toContainText('4角4番手→4着');
	await expect(row(page, 0)).toContainText('内で脚をためる。');
	await open(page, 0);
	await row(page, 0).locator('textarea').fill('直線の伸びをふりかえる。');
	await row(page, 0).getByRole('checkbox', { name: '好上り' }).check({ force: true });
	await done(page, 0);
	// 保存する前でも、いま入力しているふりかえりのメモが札付きで行に出る（出走前の下）。
	const kinds = memos(page, 0);
	await expect(kinds).toHaveCount(2);
	await expect(kinds.nth(1)).toContainText('ふりかえり');
	await expect(kinds.nth(1)).toContainText('直線の伸びをふりかえる。');
	await expect(kinds.nth(1)).toContainText('好上り');
	await page.getByRole('tab', { name: 'レース情報', exact: true }).click();
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました（1 件）')).toBeVisible();
	await gotoHydrated(page, `/races/${ROW_RACE.id}`);
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('直線の伸びをふりかえる。');
	await expect(row(page, 0)).toContainText('内で脚をためる。');
	await expect(row(page, 0).getByRole('checkbox', { name: '好上り' })).toBeChecked();
	await gotoHydrated(page, route);
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('内で脚をためる。');
});

test('ふりかえりの閉じた行で、4角・上り・人気と、出走前・ふりかえりのメモを見比べられる', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, `/races/${ROW_RACE.id}`);
	await expect(row(page, 0).locator('textarea')).toBeHidden();
	await expect(row(page, 0)).toContainText('4角4番手→4着');
	await expect(row(page, 0)).toContainText('上り34.2');
	await expect(row(page, 0)).toContainText('2人気');
	// 状態の文言は出さず、メモをそのまま出す。出走前（保存済み）→ ふりかえりの順で、どちらも札付き。
	await expect(row(page, 0)).not.toContainText('メモあり');
	await expect(row(page, 0)).not.toContainText('メモを入力する');
	const kinds0 = memos(page, 0);
	await expect(kinds0).toHaveCount(2);
	await expect(kinds0.nth(0)).toContainText('出走前');
	await expect(kinds0.nth(0)).toContainText('内で脚をためる。');
	await expect(kinds0.nth(0)).toContainText('次走買い');
	await expect(kinds0.nth(1)).toContainText('ふりかえり');
	await expect(kinds0.nth(1)).toContainText('直線の伸びをふりかえる。');
	await expect(kinds0.nth(1)).toContainText('好上り');
	// ふりかえりを書いていない馬は、出走前のメモだけ。
	const kinds1 = memos(page, 1);
	await expect(kinds1).toHaveCount(1);
	await expect(kinds1).toContainText('出走前');
	await expect(kinds1).toContainText('外から進出する。');
	// ふりかえりのメモを押すと入力欄に替わる。同じものが2つ並ばないよう、書いたメモの表示は隠れる（出走前は読むだけで残る）。
	await open(page, 0);
	await expect(row(page, 0).getByText('4角4番手→4着')).toHaveCount(1);
	await expect(row(page, 0).locator('textarea')).toHaveValue('直線の伸びをふりかえる。');
	await expect(memos(page, 0)).toHaveCount(1);
	await expect(memos(page, 0)).toContainText('出走前');
});

test('JS無効でも入力欄が出ていて一括保存でき、資料と既存導線を読める', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await login(page);
	await page.goto(route);
	// 基本情報の表は無く、発走時刻は見出しにある。JS が無くても資料（過去成績・レースメモ）が続けて出る。
	await expect(page.getByRole('region', { name: '基本情報' })).toHaveCount(0);
	await expect(page.getByText('15:45発走')).toBeVisible();
	await expect(page.getByRole('region', { name: '過去成績・レースメモ' })).toBeVisible();
	// 押しても切り替わらないタブは出さない。
	await expect(page.locator('[role="tablist"][aria-label="レースの表示"]')).toBeHidden();
	// 押しても動かないボタンは隠し、入力欄を出しっぱなしにする。
	await expect(row(page, 1).getByRole('button', { name: /(出走前|ふりかえり)メモ/ })).toHaveCount(
		0
	);
	await row(page, 1).locator('textarea').fill('JSなしで入力');
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(row(page, 1).locator('textarea')).toHaveValue('JSなしで入力');
	await page.goto(`/races/${ROW_RACE.id}`);
	await row(page, 1).locator('textarea').fill('JSなしでふりかえり');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(row(page, 1).locator('textarea')).toHaveValue('JSなしでふりかえり');
	await page.goto(`/races/${EMPTY_RACE_ID}`);
	await expect(page).toHaveURL(`/races/${EMPTY_RACE_ID}/preview`);
	await context.close();
});

test('一度も開かない馬の既存メモを保ち、別馬の印だけを保存してから意図して削除する', async ({
	page
}) => {
	await login(page);
	await gotoHydrated(page, route);
	await open(page, 1);
	await row(page, 1).locator('textarea').fill('');
	await row(page, 1).getByRole('radio', { name: '☆', exact: true }).check({ force: true });
	await done(page, 1);
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（1 件）')).toBeVisible();
	await gotoHydrated(page, route);
	await expect(row(page, 1).locator('[title="予想印 ☆"]')).toBeVisible();
	await open(page, 0);
	await expect(row(page, 0).locator('textarea')).toHaveValue('内で脚をためる。');
	await expect(row(page, 0).getByRole('radio', { name: '◎', exact: true })).toBeChecked();
	await expect(row(page, 0).getByRole('checkbox', { name: '次走買い' })).toBeChecked();
	await row(page, 1).getByRole('radio', { name: 'なし', exact: true }).check({ force: true });
	await page.getByRole('button', { name: '出走前メモを保存' }).click();
	await expect(page.getByText('保存しました（1 件）')).toBeVisible();
	await gotoHydrated(page, route);
	await expect(row(page, 1)).not.toContainText('メモを入力する');
	await open(page, 1);
	await expect(row(page, 1).locator('textarea')).toHaveValue('');
	await expect(row(page, 1).getByRole('radio', { name: 'なし', exact: true })).toBeChecked();
	await expect(row(page, 1).locator('[title="予想印 ☆"]')).toHaveCount(0);
});
