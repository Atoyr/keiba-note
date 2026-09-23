import { expect, test } from '@playwright/test';
import { login } from './login';
import { HORSE_ID, TOGGLE_SHARE_NOTE_BODY, TOGGLE_SHARE_NOTE_ID } from './seed';

/**
 * 共有は脇役。**一覧とタイムラインでは `⋯`（メモの操作）の中に畳む。**
 *
 * 以前は全メモに「共有リンクを作る」ボタンが出しっぱなしで、ダッシュボードで
 * 一番目立つのがそれだった。畳んでも操作そのものは変わらず、
 * 共有中かどうかは見出しの「共有中」の札で分かる。
 */

/** 見出しの「共有中」の札。メニューの中にも同じ文字が出るので、札の title で選ぶ。 */
const SHARED_BADGE = 'リンクを知っている人が見られます';

test('ダッシュボードでは、共有の操作はメニューを開くまで出ない', async ({ page }) => {
	await login(page);
	await page.goto('/');

	// 閉じた <details> の中身はアクセシビリティツリーに出ない。
	await expect(page.getByRole('button', { name: '共有リンクを作る' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: '共有をやめる' })).toHaveCount(0);

	// 共有中のメモは、開かなくても札で分かる。
	await expect(page.getByTitle(SHARED_BADGE).first()).toBeVisible();

	const note = page.locator('main li', { hasText: TOGGLE_SHARE_NOTE_BODY });
	await note.getByTitle('メモの操作').click();
	await expect(note.getByRole('button', { name: '共有リンクを作る' })).toBeVisible();
});

/**
 * ★ 畳んでも共有の操作は成り立つ（form POST なので本番ビルドの CSRF 検証も通る）。
 * 共有 → 共有ページが開く → やめる → 404 に戻る、まで押す。
 */
test('メニューから共有を始めて、やめられる', async ({ page, playwright }) => {
	await login(page);
	await page.goto('/');

	const note = page.locator('main li', { hasText: TOGGLE_SHARE_NOTE_BODY });
	await note.getByTitle('メモの操作').click();
	await note.getByRole('button', { name: '共有リンクを作る' }).click();

	// 見出しに札が付き、メニューの中に URL が出る。
	await expect(note.getByTitle(SHARED_BADGE)).toBeVisible();
	await page.reload();
	await note.getByTitle('メモの操作').click();
	await expect(note.locator('input[readonly]')).toHaveValue(
		new RegExp(`/notes/${TOGGLE_SHARE_NOTE_ID}$`)
	);

	// 渡した先（Cookie を持たない別の相手）では開ける。
	const baseURL = new URL(page.url()).origin;
	const other = await playwright.request.newContext({ baseURL });
	expect((await other.get(`/notes/${TOGGLE_SHARE_NOTE_ID}`)).status()).toBe(200);

	// やめると、札が消えて共有ページは 404 に戻る。
	await note.getByRole('button', { name: '共有をやめる' }).click();
	await expect(note.getByTitle(SHARED_BADGE)).toHaveCount(0);
	expect((await other.get(`/notes/${TOGGLE_SHARE_NOTE_ID}`)).status()).toBe(404);
	await other.dispose();
});

test('馬タイムラインでも、共有と削除はメニューを開くまで出ない', async ({ page }) => {
	await login(page);
	await page.goto(`/horses/${HORSE_ID}`);

	await expect(page.getByRole('button', { name: '共有リンクを作る' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'この近況メモを削除' })).toHaveCount(0);

	// seed の共有中の近況メモ。札は開かなくても出ている。
	const shared = page.locator('main ol > li', { hasText: '直線で外に出してから一完歩が速い。' });
	await expect(shared.getByTitle(SHARED_BADGE)).toBeVisible();

	await shared.getByTitle('メモの操作').click();
	await expect(shared.getByRole('button', { name: '共有をやめる' })).toBeVisible();
	await expect(shared.getByRole('button', { name: 'この近況メモを削除' })).toBeVisible();

	// レースのメモは近況ではないので、ここからは消せない（ふりかえり画面で空にして消す）。
	const entry = page.locator('main ol > li', { hasText: '直線だけの競馬になった。' });
	await entry.getByTitle('メモの操作').click();
	await expect(entry.getByRole('button', { name: '共有リンクを作る' })).toBeVisible();
	await expect(entry.getByRole('button', { name: 'この近況メモを削除' })).toHaveCount(0);
});

test('未ログインではダッシュボードのメモも共有の操作も出ない', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByText(TOGGLE_SHARE_NOTE_BODY)).toHaveCount(0);
	await expect(page.getByTitle('メモの操作')).toHaveCount(0);
});
