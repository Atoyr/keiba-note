import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceInformation from './RaceInformation.svelte';

const race = {
	date: '2026-05-01',
	course: '京都',
	raceNumber: 11,
	name: '見本',
	grade: null,
	className: null,
	surface: '芝',
	distance: 2200,
	direction: '右',
	weather: null,
	trackCondition: null
};

const gradedRace = {
	...race,
	course: '東京',
	name: '毎日王冠',
	grade: 'G2',
	surface: '芝',
	distance: 1800
};

const lastYear = {
	year: '2025',
	races: [
		{
			race: {
				id: 'last',
				date: '2025-10-05',
				course: '東京',
				raceNumber: 11,
				name: '毎日王冠',
				surface: '芝',
				distance: 1800,
				trackCondition: '良',
				winnerName: 'イチバンボシ',
				resultCount: 16
			},
			upcoming: false,
			preview: { body: '去年の見立て。', pace: null },
			review: { body: '去年のふりかえり。', tags: [] },
			entryNoteCount: 0,
			marks: []
		}
	]
};

const props = { race, graded: null, today: '2026-10-14', sameCondition: [] };

const sameNote = (id: string, raceId: string) => ({
	id,
	raceId,
	raceName: '毎日王冠',
	course: '東京',
	raceNumber: 11,
	grade: 'G2',
	occurredAt: '2025-10-05',
	body: `${raceId} のメモ`
});

it('基本情報は出さない（見出しに載せている）。非重賞には重賞導線を出さない', () => {
	const screen = render(RaceInformation, props);
	expect(screen.container.querySelector('dl')).toBeNull();
	expect(screen.container.textContent).not.toContain('基本情報');
	expect(screen.container.querySelector('a')).toBeNull();
	// 重賞でなければ、タイムラインの section もリンクも無い。
	expect(screen.container.textContent).not.toContain('重賞のタイムライン');
	expect(screen.container.textContent).not.toContain('重賞の画面で見る');
});

it('重賞の傾向 → 重賞のタイムライン → 同じ条件のレースメモ → コースの順に並べる', async () => {
	const screen = render(RaceInformation, {
		...props,
		race: gradedRace,
		graded: { key: '毎日王冠', trend: '逃げ馬が残りやすい', timeline: [lastYear] },
		sameCondition: [sameNote('n1', 'other')]
	});
	await expect.element(screen.getByText('逃げ馬が残りやすい')).toBeInTheDocument();
	const root = screen.container.firstElementChild!;
	const children = [...root.children];
	const indexOf = (text: string) => children.findIndex((el) => el.textContent?.includes(text));

	const trendIndex = indexOf('逃げ馬が残りやすい');
	const timelineIndex = indexOf('重賞のタイムライン');
	const sameIndex = indexOf('同じ条件で書いたレースのメモ');
	expect(trendIndex).toBeGreaterThanOrEqual(0);
	expect(timelineIndex).toBeGreaterThan(trendIndex);
	expect(sameIndex).toBeGreaterThan(timelineIndex);
	// コースは最後（コースの図があるレースでは同じ条件の欄より後ろ）
	const courseIndex = children.findIndex(
		(el) => el.querySelector('[aria-label="コース"]') || el.getAttribute('aria-label') === 'コース'
	);
	expect(courseIndex).toBeGreaterThan(sameIndex);

	// タイムラインの見出しに重賞の鍵が出て、重賞の画面へのリンクがある。
	const timeline = screen.getByRole('region', { name: /重賞のタイムライン/ });
	await expect.element(timeline).toHaveTextContent('毎日王冠');
	await expect.element(timeline).toHaveTextContent('去年の見立て。');
	await expect
		.element(timeline.getByRole('link', { name: '重賞の画面で見る' }))
		.toHaveAttribute('href', `/graded-races/${encodeURIComponent('毎日王冠')}`);
});

it('傾向が無くても重賞のタイムラインは出る（傾向の枠は出ない）', async () => {
	const screen = render(RaceInformation, {
		...props,
		race: gradedRace,
		graded: { key: '毎日王冠', trend: null, timeline: [lastYear] }
	});
	await expect.element(screen.getByRole('region', { name: /重賞のタイムライン/ })).toBeVisible();
	expect(screen.container.textContent).not.toContain('重賞の傾向');
	expect(screen.container.textContent).not.toContain('重賞の画面で直す');
});

it('ほかの年が無いときは、案内の文を出す', async () => {
	const screen = render(RaceInformation, {
		...props,
		race: gradedRace,
		graded: { key: '毎日王冠', trend: null, timeline: [] }
	});
	const timeline = screen.getByRole('region', { name: /重賞のタイムライン/ });
	await expect
		.element(timeline)
		.toHaveTextContent('ほかの年のこのレースは、まだ登録されていません。');
	// 案内のときも、重賞の画面へのリンクは残る。
	await expect.element(timeline.getByRole('link', { name: '重賞の画面で見る' })).toBeVisible();
});

it('重賞の同じ条件の欄には、渡されたメモと条件が出る', async () => {
	const screen = render(RaceInformation, {
		...props,
		race: gradedRace,
		graded: { key: '毎日王冠', trend: null, timeline: [lastYear] },
		sameCondition: [sameNote('n2', 'other')]
	});
	const same = screen.getByRole('region', { name: /同じ条件で書いたレースのメモ/ });
	await expect.element(same).toHaveTextContent('other のメモ');
	await expect.element(same).toHaveTextContent('（東京 芝1800m）');
});

it('メモが0件のとき、重賞は「ほかに〜」の文言、重賞でなければ今の文言を出す', async () => {
	const gradedScreen = render(RaceInformation, {
		...props,
		race: gradedRace,
		graded: { key: '毎日王冠', trend: null, timeline: [lastYear] },
		sameCondition: []
	});
	await expect
		.element(gradedScreen.getByText('ほかに同じ条件で書いたレースのメモはありません。'))
		.toBeVisible();
	await gradedScreen.unmount();

	const plain = render(RaceInformation, props);
	await expect.element(plain.getByText('同じ条件のレースメモはまだありません。')).toBeVisible();
	expect(plain.container.textContent).not.toContain('ほかに同じ条件');
});
