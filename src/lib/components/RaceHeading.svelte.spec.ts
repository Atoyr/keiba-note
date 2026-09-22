import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceHeading from './RaceHeading.svelte';
import '../../routes/layout.css';

/**
 * 見出しはスマホ幅（320px）で崩れないことが要件。
 * レース名が長くても1行目の高さが変わらず、重賞の札が1行目に
 * 混ざらないことを、実ブラウザ上の寸法で見る。
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
	const [meeting, name] = Array.from(h1().querySelectorAll('span'));
	return { meeting, name };
}

function badge() {
	return document.querySelector('[data-slot="badge"]');
}

describe('RaceHeading', () => {
	it('入りきらないレース名は … で詰め、1行目を折り返さない', () => {
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
	});

	it('開催（日付・場・R）は詰めずに最後まで出す', () => {
		narrow();
		render(RaceHeading, {
			meeting: '2026-10-04 東京11R',
			name: LONG_NAME,
			grade: 'G2',
			spec: '芝1800m / 左 / 良'
		});

		const { meeting } = spans();
		expect(meeting.scrollWidth).toBe(meeting.clientWidth);
		expect(meeting.textContent).toBe('2026-10-04 東京11R');
	});

	it('重賞の札は1行目ではなく2行目に出る', () => {
		narrow();
		render(RaceHeading, {
			meeting: '2026-10-04 東京11R',
			name: LONG_NAME,
			grade: 'G2',
			spec: '芝1800m / 左 / 良'
		});

		const g = badge();
		expect(g?.textContent?.trim()).toBe('G2');
		// 札の上端が見出しの下端より下にある＝別の行にいる。
		expect(g!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			h1().getBoundingClientRect().bottom
		);
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

	it('重賞でないレースには札を出さない', () => {
		narrow();
		render(RaceHeading, {
			meeting: '2026-10-04 東京8R',
			name: '3歳以上2勝クラス',
			grade: null,
			spec: '3歳以上2勝クラス / 芝1600m'
		});

		expect(badge()).toBeNull();
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
	});
});
