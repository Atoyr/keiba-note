import { expect, test, type Page } from '@playwright/test';
import { gotoHydrated, waitForHydration } from './hydration';
import { login } from './login';
import {
	ACTUAL_FLOW_RACE_ID,
	BRACKET_RACE_ID,
	EMPTY_RACE_ID,
	MARKS_RACE_ID,
	OTHER_DISTANCE_RACE_ID,
	OTHER_USER_PREVIEW_BODY,
	OUTER_PREVIEW_BODY,
	PAST_EMPTY_RACE_ID,
	REVIEW_RACE_ID,
	THIS_WEEK_RACES
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
 * **何も付けずに開いたレース一覧は、今年の重賞だけ。** 探しに来るのはほとんどが今年の重賞で、
 * 絞らないと条件戦と、枠だけ先に登録した先の重賞が上を埋める。
 *
 * 見るのは3つ。今日の重賞（E2E今週賞）は出る / 条件戦（E2E特別）と先の年（E2E未来賞）は出ない。
 * フォームが既定の条件を映している。クリアすると全件に戻る（`/races` の既定に戻らない）。
 */
test('レース一覧は既定で今年の重賞に絞られ、クリアで全件になる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/races');

	const thisYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric' })
		.format(new Date())
		.slice(0, 4);
	await expect(page.getByLabel('年度')).toHaveValue(thisYear);
	for (const grade of ['G1', 'G2', 'G3']) {
		await expect(page.getByRole('checkbox', { name: grade })).toBeChecked();
	}
	for (const grade of ['L', 'OP']) {
		await expect(page.getByRole('checkbox', { name: grade })).not.toBeChecked();
	}

	await expect(page.getByRole('link', { name: /E2E今週賞/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /E2E特別/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: /E2E未来賞/ })).toHaveCount(0);

	await page.getByRole('link', { name: '条件をクリア' }).click();
	await expect(page).toHaveURL('/races?year=');
	await expect(page.getByLabel('年度')).toHaveValue('');
	await expect(page.getByRole('checkbox', { name: 'G1' })).not.toBeChecked();
	await expect(page.getByRole('link', { name: /E2E特別/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /E2E未来賞/ })).toBeVisible();
	await expect(page.getByRole('link', { name: '条件をクリア' })).toHaveCount(0);
});

/**
 * フォームで「すべて」を選び、ランクを全部外して送ると全件になる。
 * 送った URL は `year=` を持つので、既定（今年の重賞）には戻らない。
 */
test('レース一覧のフォームで条件を全部外して送ると、既定に戻らず全件になる', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, '/races');

	await page.getByLabel('年度').selectOption('');
	for (const grade of ['G1', 'G2', 'G3']) {
		await page.getByRole('checkbox', { name: grade }).uncheck();
	}
	await page.getByRole('button', { name: '絞り込む' }).click();

	await expect(page).toHaveURL(/\/races\?year=&q=$/);
	await expect(page.getByRole('link', { name: /E2E特別/ })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'G1' })).not.toBeChecked();
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
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}`);

	await expect(page.getByText('出走馬がまだ登録されていません。')).toBeVisible();
	// 保存ボタンは書いてから出る（SaveBar）。保存はしない。
	await page.locator('textarea[name="raceNoteBody"]').fill('前残り。');
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

/** 格の札は一覧の行ではレース名の**前**（product.md 第6章）。ダッシュボードと同じ並び。 */
test('今週の重賞とレース一覧で、格の札がレース名の前に出る', async ({ page }) => {
	await login(page);
	const { upcoming } = THIS_WEEK_RACES;
	const order = new RegExp(String.raw`中京11R\s*G3\s*` + upcoming.name);

	await page.goto('/this-week');
	await expect(page.getByRole('link', { name: new RegExp(upcoming.name) })).toHaveText(order);

	await page.goto('/races');
	await expect(page.getByRole('link', { name: new RegExp(upcoming.name) })).toHaveText(order);
});

/**
 * 今週の重賞は予想の入口。**結果が出たレースだけ**ふりかえりへ向ける。
 *
 * 日付だけで決めると、当日の朝に見立てを書きに来てもふりかえりへ飛ぶ。
 * どちらも今日のレースで、着順の有無だけが違う2つを並べて見る。
 */
test('今週の重賞から、結果が出たレースはふりかえりへ、まだのレースは予想画面へ行く', async ({
	page
}) => {
	await login(page);
	await page.goto('/this-week');

	const { settled, upcoming } = THIS_WEEK_RACES;
	await expect(page.getByRole('link', { name: new RegExp(settled.name) })).toHaveAttribute(
		'href',
		`/races/${settled.id}`
	);
	await expect(page.getByRole('link', { name: new RegExp(upcoming.name) })).toHaveAttribute(
		'href',
		`/races/${upcoming.id}/preview`
	);

	await page.getByRole('link', { name: new RegExp(settled.name) }).click();
	await expect(page).toHaveURL(`/races/${settled.id}`);
	await expect(page.getByText('ペース、馬場、展開など「レースの性質」')).toBeVisible();
});

/**
 * レース一覧も同じ線引き（→ `opensReview`）。開催済みでも結果の投入前（E2E結果待ち賞）は
 * 予想画面へ、着順の入ったレース（E2E枠色賞）と、ふりかえりを書いたレースはふりかえりへ。
 *
 * **全件（`?year=`）で開く。** ここに並ぶレースは seed で日付が固定なので、
 * 既定（今年の重賞）で開くと、年が変わった日から一覧に出なくなる。
 */
test('レース一覧から、結果が出たレースはふりかえりへ、結果の投入前は予想画面へ行く', async ({
	page
}) => {
	await login(page);
	await page.goto('/races?year=');

	await expect(page.getByRole('link', { name: /E2E枠色賞/ })).toHaveAttribute(
		'href',
		`/races/${BRACKET_RACE_ID}`
	);
	await expect(page.getByRole('link', { name: /E2E結果待ち賞/ })).toHaveAttribute(
		'href',
		`/races/${PAST_EMPTY_RACE_ID}/preview`
	);
	// 結果の投入前でも、ふりかえりを書いてあるレース（E2E別距離賞）はそれがあるふりかえりへ。
	await expect(page.getByRole('link', { name: /E2E別距離賞/ })).toHaveAttribute(
		'href',
		`/races/${OTHER_DISTANCE_RACE_ID}`
	);
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
	// 答え合わせの欄にも同じ馬名が出るので、書く欄（form の中）の行に絞る。
	const row = page.locator('form li', { hasText: 'E2Eソトワク' });
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
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}/preview`);
	await page.locator('textarea[name="raceNoteBody"]').fill('前残りを狙いたい。');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	// 事後 — ふりかえりを書く。上に見立てが読み取り専用で出ている。
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}`);
	await expect(page.getByText('前残りを狙いたい。')).toBeVisible();
	await page.locator('textarea[name="raceNoteBody"]').fill('実際は差し決着だった。');
	await page.getByRole('button', { name: 'レースのメモを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	// ふりかえりを保存したあとも見立てはそのまま。
	await page.reload();
	await expect(page.getByText('前残りを狙いたい。')).toBeVisible();
	await expect(page.locator('textarea[name="raceNoteBody"]')).toHaveValue('実際は差し決着だった。');

	// 予想画面に戻っても、見立てはふりかえりで上書きされていない。
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}/preview`);
	await expect(page.locator('textarea[name="raceNoteBody"]')).toHaveValue('前残りを狙いたい。');

	// 後片付け。どちらも空で保存すると消える。
	await page.locator('textarea[name="raceNoteBody"]').fill('');
	await page.getByRole('button', { name: 'レースの見立てを保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}`);
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
		/◎.*E2Eソトワク.*2着.*馬券内/,
		/○.*E2Eウチワク.*1着.*馬券内/
	]);
	await expect(answers).toContainText('◎○▲△☆ 2頭中 2頭 馬券内');
	// 的中は馬券に使う言葉。このアプリは馬券を記録していないので、印には使わない。
	await expect(answers).not.toContainText(/当たり|外れ|的中/);
});

/**
 * 各馬の行に、走りを読むための数字（4角の位置 → 着順・上りの順位・人気）が出る。
 *
 * seed の E2E印見本特別では、⑤アナウマが6人気・4角5番手から2着・上り1位、①ホンメイが上り2位、
 * ⑥ケシウマが上り3位。上りの順位は出走馬全体で数えるので、行ごとの値だけでは決まらない。
 */
test('各馬の行に、4角の位置から着順・上りの順位・人気が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${MARKS_RACE_ID}`);

	const row = (name: string) => page.locator('form li', { hasText: name });

	await expect(row('E2Eアナウマ')).toContainText('4角5番手→2着');
	await expect(row('E2Eアナウマ')).toContainText('6人気');
	await expect(row('E2Eアナウマ').getByTitle('上り1位')).toHaveText('上り1位 33.7');
	await expect(row('E2Eホンメイ').getByTitle('上り2位')).toBeVisible();
	await expect(row('E2Eケシウマ').getByTitle('上り3位')).toBeVisible();

	// 4位以下は順位を出さない。上りのタイムだけ。
	await expect(row('E2Eタイコウ')).toContainText('上り34.8');
	await expect(row('E2Eタイコウ').getByTitle(/上り\d位/)).toHaveCount(0);

	// 通過順も上りも無い馬（着順なし）には2行目を出さない。
	await expect(row('E2Eメモノミ')).not.toContainText('4角');
	// 札の「好上り」には当たらないよう、上りのタイム（上り＋数字）で見る。
	await expect(row('E2Eメモノミ')).not.toContainText(/上り\d/);
});

/**
 * ★ 出走馬を気にしている馬だけ入れたレースでは、上りの順位を出さない。
 * 入っている馬の中だけで数えると、1頭しか入っていなければ6着でも「上り1位」になる。
 * seed の E2E枠色賞は16頭立てで、入っているのは2頭だけ。
 */
test('全頭の上りがそろっていないレースでは、上りのタイムだけで順位を出さない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page.locator('form li', { hasText: 'E2Eウチワク' })).toContainText('上り33.8');
	await expect(page.locator('form').getByTitle(/上り\d位/)).toHaveCount(0);
});

/** 「実際の展開」の欄。局面（見出し）ごとに、盤面の下の隊列の1行を返す。 */
const actualFlowRows = (page: Page) =>
	page
		.getByRole('region', { name: '実際の展開' })
		.locator('h3')
		.evaluateAll((hs) =>
			hs.map((h) => [
				h.textContent?.trim(),
				[...(h.parentElement?.querySelectorAll('p') ?? [])].map((p) =>
					p.textContent?.replace(/\s+/g, '')
				)
			])
		);

/**
 * ★ **展開を予想していなくても、実際の展開が出る。** 4角は通過順、ゴール前は着順の並び。
 * seed の E2E実際展開賞は予想もメモも無い6頭立て。①と③は4角で同じ2番手、
 * ⑥は4角の手前で中止（通過順が3つで切れる）なので、4角にもゴール前にも出ない。
 */
test('展開を予想していないレースでも、4角とゴール前の実際の隊列が出る', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${ACTUAL_FLOW_RACE_ID}`);

	expect(await actualFlowRows(page)).toEqual([
		['4コーナー', ['②-①③-④-⑤']],
		['ゴール前', ['①-②-③-④-⑤']]
	]);
	// 予想と同じ盤面で見せる。①と③は同じ2番手なので、同じマスに積む。
	const corner4 = page.getByRole('group', { name: '実際の4コーナーの隊列' });
	await expect(corner4.getByText('1番 E2Eサンバンテ（前から2列目・内）')).toBeAttached();
	await expect(corner4.getByText('3番 E2Eマクリ（前から2列目・中）')).toBeAttached();
	await expect(page.getByRole('group', { name: '実際のゴール前の隊列' })).toBeVisible();
	// 予想が無いので「予想」の段も、開催前の見立ても出ない。
	await expect(page.getByRole('region', { name: '実際の展開' })).not.toContainText('予想');
	await expect(page.getByText('開催前の見立て')).toHaveCount(0);

	// 通過順が途中で切れた中止の馬には「4角N番手」を出さない（最後の数字は4角ではない）。
	await expect(page.locator('form li', { hasText: 'E2Eチュウシ' })).not.toContainText('4角');
	await expect(page.locator('form li', { hasText: 'E2Eマクリ' })).toContainText('4角2番手→3着');
});

/** 予想で展開を置いていたら、同じ局面の下に予想の隊列を並べて見比べられる。 */
test('展開を予想していたレースでは、実際の隊列の下に予想の隊列が並ぶ', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${MARKS_RACE_ID}`);

	expect(await actualFlowRows(page)).toEqual([
		['4コーナー', ['実際③-①-⑥-④-⑤-②', '予想③-①⑤-②-④-⑥-⑦']],
		['ゴール前', ['実際①-⑤-③-⑥-②-④', '予想①②-③-⑤-⑦-④-⑥']]
	]);
	// 同じ隊列を「開催前の見立て」の閉じた行に重ねて出さない（予想の盤面は開けば見られる）。
	const preview = page.locator('details', { hasText: '展開の予想' });
	await expect(preview.locator('summary')).not.toContainText('③-①⑤');
});

/** 出走馬を気にしている馬だけ入れたレースでは、2頭の並びが全体の流れに見えるので出さない。 */
test('走った全頭がそろっていないレースでは、実際の展開を出さない', async ({ page }) => {
	await login(page);
	await page.goto(`/races/${BRACKET_RACE_ID}`);

	await expect(page.getByRole('heading', { name: '答え合わせ' })).toBeVisible();
	await expect(page.getByRole('region', { name: '実際の展開' })).toHaveCount(0);
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
	await gotoHydrated(page, `/races/${BRACKET_RACE_ID}`);

	const row = page.locator('form li', { hasText: 'E2Eソトワク' });
	await row.locator('textarea').fill('結局外を回して届かず。');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();

	await page.reload();
	await expect(row.locator('textarea')).toHaveValue('結局外を回して届かず。');
	await expect(row).toContainText(OUTER_PREVIEW_BODY);
	await expect(row.getByTitle('予想印 ◎')).toBeVisible();

	// 後片付け。空で保存するとふりかえりのメモは消える。
	await waitForHydration(page);
	await row.locator('textarea').fill('');
	await page.getByRole('button', { name: 'まとめて保存' }).click();
	await expect(page.getByText('保存しました')).toBeVisible();
});

/** ふりかえり画面でも、書きかけのままアプリ内のリンクで離れようとしたら止める。 */
test('ふりかえりを書きかけのままリンクを押すと、離れる前に確認が出る', async ({ page }) => {
	await login(page);
	await gotoHydrated(page, `/races/${PAST_EMPTY_RACE_ID}`);
	await page.locator('textarea[name="raceNoteBody"]').fill('前残り。');

	const messages: string[] = [];
	page.once('dialog', (d) => {
		messages.push(d.message());
		void d.dismiss();
	});
	await page.getByRole('navigation').getByRole('link', { name: '馬' }).click();
	await expect
		.poll(() => messages)
		.toEqual(['保存していない変更があります。保存せずにこのページを離れますか？']);
	await expect(page).toHaveURL(`/races/${PAST_EMPTY_RACE_ID}`);
});
