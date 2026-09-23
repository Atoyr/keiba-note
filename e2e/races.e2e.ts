import { expect, test } from '@playwright/test';
import { login } from './login';
import {
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	OTHER_USER_PREVIEW_BODY,
	OUTER_PREVIEW_BODY,
	PAST_EMPTY_RACE_ID,
	REVIEW_RACE_ID
} from './seed';

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

test('出走馬が並んでいれば「まとめて保存」のまま', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${REVIEW_RACE_ID}`);

	await expect(page.getByRole('button', { name: 'まとめて保存' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'レースのメモを保存' })).toHaveCount(0);
});

/**
 * 認証は開催前の振り分けより先に効く。**開催前のレースで見るのが要点**で、
 * 予想画面へのリダイレクトが認証を追い越すと、未ログインのまま中身が出る。
 */
test('ふりかえり画面は未ログインでは開けない', async ({ page }) => {
	await page.goto(`/races/${EMPTY_RACE_ID}`);

	await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(`/races/${EMPTY_RACE_ID}`)}`);
	// レース名すら出ていないこと。
	await expect(page.getByText('E2E出馬表前賞')).toHaveCount(0);
});

/**
 * 枠は色で読む。この画面は**着順で並ぶ**ので、色が無いと
 * 「内で決まったレースだったのか」がひと目で拾えない。
 * 色は JRA の帽子の色に合わせてあり、**数字も必ず一緒に出す**。
 */
test('出走馬の枠番が枠の色で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	// 1枠は白。面が背景と同じなので、輪郭が無いと消える。
	const inner = page.getByTitle('1枠');
	await expect(inner).toBeVisible();
	await expect(inner).toHaveText('1');
	await expect(inner).toHaveClass(/bg-white/);
	await expect(inner).toHaveClass(/border-gray-400/);

	// 8枠は桃。
	const outer = page.getByTitle('8枠');
	await expect(outer).toBeVisible();
	await expect(outer).toHaveText('8');
	await expect(outer).toHaveClass(/bg-pink-300/);

	// 枠の色は馬番を置き換えるものではない。両方出ていること。
	// 答え合わせの欄にも同じ馬名が出るので、書く欄（form の中）の行に絞る。
	const row = page.locator('form li', { hasText: 'E2Eソトワク' });
	await expect(row).toContainText('16');
});

/** 出走馬の並んだレースでも、未ログインなら馬名まで出ないこと。 */
test('未ログインでは出走馬の名前も出ない', async ({ page }) => {
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page).toHaveURL(
		`/login?redirect=${encodeURIComponent(`/races/${BRACKET_RACE_ID}`)}`
	);
	await expect(page.getByText('E2Eウチワク')).toHaveCount(0);
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

/**
 * ★ **答え合わせ。** 予想で付けた印と着順を、印の順（◎ → ×）に並べる。
 *
 * seed では◎を2着の馬、○を1着の馬に付けてある。着順の並び（1着 → 2着）のまま
 * 出ていたら、印の順に並べ直していないことになる。
 */
test('ふりかえり画面の上に、予想の印と着順が印の順に並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	const answers = page.locator('section', {
		has: page.getByRole('heading', { name: '答え合わせ' })
	});
	await expect(answers.locator('li')).toHaveText([
		/◎.*E2Eソトワク.*2着.*当たり/,
		/○.*E2Eウチワク.*1着.*当たり/
	]);
	await expect(answers).toContainText('2頭中 2頭 当たり');
});

/**
 * 出走前メモは各馬の行に**読むだけ**で出る。直せる欄にすると、結果を見てから
 * 予想を書き換えられてしまい、答え合わせが成り立たない。
 */
test('各馬の行に、走る前に書いたメモが読み取り専用で出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	const row = page.locator('form li', { hasText: 'E2Eソトワク' });
	await expect(row).toContainText(OUTER_PREVIEW_BODY);
	await expect(row).toContainText('次走買い');
	await expect(row.getByTitle('予想印 ◎')).toBeVisible();

	// 入力欄には入っていない（ふりかえりの欄は空のまま）。
	for (const value of await page
		.locator('textarea')
		.evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value))) {
		expect(value).not.toContain(OUTER_PREVIEW_BODY);
	}
});

/**
 * ★ **他人の印は答え合わせに混ざらない。** seed では別のユーザーが同じレースの
 * ウチワクに × を付けている。混ざると「自分の予想」の答え合わせが嘘になる。
 */
test('他人が同じレースに付けた印と出走前メモは出ない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page.getByRole('heading', { name: '答え合わせ' })).toBeVisible();
	await expect(page.getByText(OTHER_USER_PREVIEW_BODY)).toHaveCount(0);
	await expect(page.getByTitle('予想印 ×')).toHaveCount(0);
});

/**
 * 出走前メモ（`preview`）とふりかえり（`entry`）は別の行。
 * ふりかえりを保存しても、走る前の印とメモは残る。
 */
test('ふりかえりを保存しても、出走前の印とメモは消えない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	const row = page.locator('form li', { hasText: 'E2Eソトワク' });
	await row.locator('textarea').fill('結局外を回して届かず。');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	await page.reload();
	await expect(row.locator('textarea')).toHaveValue('結局外を回して届かず。');
	await expect(row).toContainText(OUTER_PREVIEW_BODY);
	await expect(row.getByTitle('予想印 ◎')).toBeVisible();

	// 後片付け。空で保存するとふりかえりのメモは消える。
	await row.locator('textarea').fill('');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
});
