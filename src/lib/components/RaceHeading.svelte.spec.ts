import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceHeading from './RaceHeading.svelte';
import '../../routes/layout.css';

/**
 * 見出しはスマホ幅（320px）で崩れないことが要件。
 * レース名が長くても1行目の高さが変わらず、重賞の札がレース名の前に
 * 1行目のまま残ることを、実ブラウザ上の寸法で見る。
 */
const PHONE = 320;

/** レース名が確実にあふれる長さ。 */
const LONG_NAME = 'アイルランドトロフィー東京タイムズ杯';

function narrow() {
	document.body.style.width = `${PHONE}px`;
}

afterEach(() => {
	document.body.style.width = '';
});

function h1() {
	const el = document.querySelector('h1');
	if (!el) throw new Error('見出しが無い');
	return el;
}

function spans() {
	const [meeting] = Array.from(h1().children) as HTMLElement[];
	const name = h1().querySelector<HTMLElement>('.truncate');
	if (!name) throw new Error('レース名が無い');
	return { meeting, name };
}

function badge() {
	return document.querySelector('[data-slot="badge"]');
}

describe('RaceHeading', () => {
	it('長いレース名だけを … で詰め、開催と重賞の札は1行目に最後まで出す', () => {
		narrow();
		render(RaceHeading, {
			meeting: '2026-10-04 東京11R',
			name: LONG_NAME,
			grade: 'G2',
			spec: '芝1800m / 左 / 良'
		});

		const { meeting, name } = spans();
		const style = getComputedStyle(name);

		// はみ出した分が … になっていること。
		expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
		expect(style.textOverflow).toBe('ellipsis');
		expect(style.whiteSpace).toBe('nowrap');

		// 1行目は1行のまま（レース名が回り込んで高さが増えない）。
		expect(h1().getBoundingClientRect().height).toBeCloseTo(
			meeting.getBoundingClientRect().height,
			0
		);

		// 開催（日付・場・R）は詰めずに最後まで出す。
		expect(meeting.scrollWidth).toBe(meeting.clientWidth);
		expect(meeting.textContent).toBe('2026-10-04 東京11R');

		// 札は1行目の中にいて、開催とレース名のあいだに並ぶ。
		const g = badge()!.getBoundingClientRect();
		expect(badge()?.textContent?.trim()).toBe('G2');
		expect(g.top).toBeGreaterThanOrEqual(h1().getBoundingClientRect().top);
		expect(g.bottom).toBeLessThanOrEqual(h1().getBoundingClientRect().bottom);
		expect(g.left).toBeGreaterThanOrEqual(meeting.getBoundingClientRect().right);
		expect(g.right).toBeLessThanOrEqual(name.getBoundingClientRect().left);
	});

	it('短いレース名は詰めない', () => {
		narrow();
		render(RaceHeading, {
			meeting: '東京11R',
			name: '毎日王冠',
			grade: 'G2',
			spec: '芝1800m / 左'
		});

		const { name } = spans();
		expect(name.scrollWidth).toBe(name.clientWidth);
	});

	it('レース名が無くても見出しが立つ', () => {
		narrow();
		render(RaceHeading, {
			meeting: '2026-10-04 東京8R',
			name: null,
			grade: null,
			spec: '芝1600m'
		});

		expect(h1().textContent?.trim()).toBe('2026-10-04 東京8R');
		expect(badge()).toBeNull();
	});
});
