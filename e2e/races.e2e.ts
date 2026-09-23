import { expect, test } from '@playwright/test';
import { login } from './login';
import { BRACKET_RACE_ID, EMPTY_RACE_ID, PAST_EMPTY_RACE_ID, REVIEW_RACE_ID } from './seed';

/**
 * レース一覧の絞り込みは GET クエリで表される。
 * **クエリが付いていても未ログインでは開けない**こと、
 * 戻り先として条件ごと保持されることを見る。
 */
test('絞り込み付きのレース一覧も未ログインでは開けず、条件ごと戻り先に残る', async ({ page }) => {
	await page.goto('/races?year=2026&grade=G1&grade=G3&q=%E8%A8%98%E5%BF%B5');

	await expect(page).toHaveURL(/\/login\?redirect=/);

	const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
	const target = new URL(redirect, page.url());
	expect(target.pathname).toBe('/races');
	expect(target.searchParams.getAll('grade')).toEqual(['G1', 'G3']);
	expect(target.searchParams.get('year')).toBe('2026');
	expect(target.searchParams.get('q')).toBe('記念');

	// 一覧の中身が漏れていないこと。
	await expect(page.getByRole('heading', { name: 'レース' })).toHaveCount(0);
});

/**
 * ふりかえり画面の保存ボタン。
 *
 * この画面は「レースのメモ + 各馬のメモ」を1送信で保存するので「まとめて保存」だが、
 * 出走馬がまだ登録されていないレースでは入力欄が1つしか無い。そこで「まとめて」と
 * 名乗ると、画面に出ていない何かも一緒に保存されるように読める。
 *
 * **開催済みのレースで見る。** 開催前のレースはふりかえり自体が開けない。
 *
 * 文言の分岐は `raceReviewSaveLabel` の単体テストで両方見ている。ここは配線の確認。
 */
test('出走馬がいないレースの保存ボタンは「まとめて」と名乗らない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}`);

	await expect(page.getByText('出走馬がまだ登録されていません。')).toBeVisible();
	await expect(page.getByRole('button', { name: 'レースのメモを保存' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'まとめて保存' })).toHaveCount(0);
});

/**
 * ★ **まだ走っていないレースにふりかえりは書けない。**
 *
 * 走る前に「どう走ったか」を訊く欄が出ていると、書く場所を間違えたのかと読ませる。
 * 開催前に書きたいことは予想画面（見立てと出走前メモ）にあるので、そちらへ送る。
 */
test('開催前のレースを開くとふりかえりではなく予想画面へ行く', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${EMPTY_RACE_ID}`);

	await expect(page).toHaveURL(`/races/${EMPTY_RACE_ID}/preview`);
	// ふりかえりの入力欄（レースのメモ）が1つも無いこと。
	await expect(page.getByText('ペース、馬場、展開など「レースの性質」')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'まとめて保存' })).toHaveCount(0);
});

/** 開催済みなら、これまでどおりふりかえりが開く。 */
test('開催済みのレースはふりかえりが開く', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${REVIEW_RACE_ID}`);

	await expect(page).toHaveURL(`/races/${REVIEW_RACE_ID}`);
	await expect(page.getByText('ペース、馬場、展開など「レースの性質」')).toBeVisible();
});

/**
 * 枠は色で読む。この画面は**着順で並ぶ**ので、色が無いと
 * 「内で決まったレースだったのか」がひと目で拾えない。
 * 色そのものは BracketBadge の表が持つ。ここでは札が出て、**数字も一緒に出る**ことを見る。
 */
test('出走馬の枠番が枠の札で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page.getByTitle('1枠')).toHaveText('1');
	await expect(page.getByTitle('8枠')).toHaveText('8');

	// 枠の札は馬番を置き換えるものではない。両方出ていること。
	const row = page.locator('main li', { hasText: 'E2Eソトワク' });
	await expect(row).toContainText('16');
});

/**
 * ★ **開催前に書いた見立ては、ふりかえりの保存で消えない。**
 *
 * どちらもレース1本に付く1行だが、kind が違う別の行として入る
 * （`race_preview` / `race`）。同じ行にすると、走ったあとに書いた瞬間
 * 「走る前に何を考えていたか」が上書きで失われる。事前と事後を見比べられることが、
 * そもそもふりかえりを書く理由なので、ここが壊れると機能の意味が無くなる。
 *
 * **開催済みのレースで見る。** 開催前だとふりかえりが開けない。
 */
test('開催前に書いた見立ては、ふりかえりを保存しても残る', async ({ page }) => {
	await login(page);

	// 事前 — 予想画面で見立てを書く。
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}/preview`);
	await page.locator('textarea[name="raceNoteBody"]').fill('前残りを狙いたい。');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	// 事後 — ふりかえりを書く。上に見立てが読み取り専用で出ている。
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}`);
	await expect(page.getByText('前残りを狙いたい。')).toBeVisible();
	await page.locator('textarea[name="raceNoteBody"]').fill('実際は差し決着だった。');
	await page.getByRole('button', { name: 'レースのメモを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	// ふりかえりを保存したあとも見立てはそのまま。
	await page.reload();
	await expect(page.getByText('前残りを狙いたい。')).toBeVisible();
	await expect(page.locator('textarea[name="raceNoteBody"]')).toHaveValue('実際は差し決着だった。');

	// 予想画面に戻っても、見立てはふりかえりで上書きされていない。
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}/preview`);
	await expect(page.locator('textarea[name="raceNoteBody"]')).toHaveValue('前残りを狙いたい。');

	// 後片付け。どちらも空で保存すると消える。
	await page.locator('textarea[name="raceNoteBody"]').fill('');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
	await page.goto(`/races/${PAST_EMPTY_RACE_ID}`);
	await page.locator('textarea[name="raceNoteBody"]').fill('');
	await page.getByRole('button', { name: 'レースのメモを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
});
