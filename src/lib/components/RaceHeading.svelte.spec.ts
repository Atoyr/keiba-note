import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import RaceHeading from './RaceHeading.svelte';
import '../../routes/layout.css';

/**
 * 見出しはスマホ幅（320px）で崩れないことが要件。
 * レース名が長くても1行目の高さが変わらず、重賞の札が1行目に
 * 混ざらないことを、実ブラウザ上の寸法で見る。
 */
const PHONE = 320;

/**
 * レース名が確実にあふれる長さ。**どのフォントで描いてもあふれるよう、実在の名前より長くしてある。**
 * 1行目に開催（場・R）だけが並ぶので、レース名には 320px のうち 235px ほどが残る。
 * 19文字では、CI（Ubuntu）の字幅だとちょうど収まってしまい、… にならなかった。
 */
const LONG_NAME = 'アイルランドトロフィー府中牝馬ステークス東京タイムズ杯';

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
	it('長いレース名だけを … で詰め、開催は最後まで出し、重賞の札は2行目に回す', () => {
		narrow();
		render(RaceHeading, {
			meeting: '東京11R',
			name: LONG_NAME,
			grade: 'G2',
			spec: '2026-10-04 · 芝1800m / 左 / 良'
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

		// 開催（場・R）は詰めずに最後まで出す。
		expect(meeting.scrollWidth).toBe(meeting.clientWidth);
		expect(meeting.textContent).toBe('東京11R');

		// 札の上端が見出しの下端より下にある＝別の行にいる。
		const g = badge();
		expect(g?.textContent?.trim()).toBe('G2');
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

	it('レース名が無くても見出しが立つ', () => {
		narrow();
		render(RaceHeading, {
			meeting: '東京8R',
			name: null,
			grade: null,
			spec: '2026-10-04 · 芝1600m'
		});

		expect(h1().textContent?.trim()).toBe('東京8R');
	});

	describe('links（⋯ のメニュー）', () => {
		const LINKS = [
			{ href: '/races/r1/summary', label: '予想をまとめて見る' },
			{ href: '/graded-races/%E6%AF%8E%E6%97%A5%E7%8E%8B%E5%86%A0', label: '重賞のタイムライン' },
			{ href: '/races/r1', label: 'ふりかえりを書く' }
		];
		const base = { meeting: '東京11R', name: '毎日王冠', grade: 'G2', spec: '芝1800m / 左' };

		const menuButton = () =>
			document.querySelector<HTMLButtonElement>('[aria-label="レースのメニュー"]');
		const titleButton = () => h1().querySelector<HTMLButtonElement>('button');
		const items = () =>
			Array.from(document.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'));
		const menu = () => document.querySelector('[role="menu"]');

		it('links が無ければ ⋯ もタイトルのボタンも出ない', () => {
			render(RaceHeading, base);
			expect(menuButton()).toBeNull();
			expect(titleButton()).toBeNull();

			document.body.innerHTML = '';
			render(RaceHeading, { ...base, links: [] });
			expect(menuButton()).toBeNull();
			expect(titleButton()).toBeNull();
		});

		it('⋯ を押すと、項目が links の順・label・href で出る', async () => {
			render(RaceHeading, { ...base, links: LINKS });
			expect(menu()).toBeNull();

			menuButton()!.click();
			await expect.poll(() => items().length).toBe(LINKS.length);
			expect(items().map((a) => a.textContent?.trim())).toEqual(LINKS.map((l) => l.label));
			expect(items().map((a) => a.getAttribute('href'))).toEqual(LINKS.map((l) => l.href));
			expect(items().every((a) => a.tagName === 'A')).toBe(true);
		});

		it('タイトルを押すと開き、もう一度押すと閉じる', async () => {
			render(RaceHeading, { ...base, links: LINKS });
			const title = titleButton()!;
			expect(title.getAttribute('aria-haspopup')).toBe('menu');
			expect(title.getAttribute('aria-expanded')).toBe('false');

			await userEvent.click(title);
			await expect.poll(() => items().length).toBe(LINKS.length);
			expect(title.getAttribute('aria-expanded')).toBe('true');

			// 開いている間 body は pointer-events: none になり、実際のマウスの押下は届かない。
			// click のトグルだけを確かめる（外側を押して閉じるほうは bits-ui の仕事で、E2E で見る）。
			title.click();
			await expect.poll(() => menu()).toBeNull();
			expect(title.getAttribute('aria-expanded')).toBe('false');
		});

		it('タイトルから開いて Esc で閉じると、フォーカスがタイトルに戻る', async () => {
			render(RaceHeading, { ...base, links: LINKS });
			const title = titleButton()!;

			await userEvent.click(title);
			await expect.poll(() => items().length).toBe(LINKS.length);

			await userEvent.keyboard('{Escape}');
			await expect.poll(() => menu()).toBeNull();
			await expect.poll(() => document.activeElement).toBe(title);
		});

		it('タイトルに Enter で開くと、矢印キーで項目へ移れる', async () => {
			render(RaceHeading, { ...base, links: LINKS });
			const title = titleButton()!;

			title.focus();
			await userEvent.keyboard('{Enter}');
			await expect.poll(() => items().length).toBe(LINKS.length);

			await userEvent.keyboard('{ArrowDown}');
			await expect.poll(() => document.activeElement?.getAttribute('role')).toBe('menuitem');
		});

		it('レース名は選べて、選んだ終わりの click ではメニューを開かない', async () => {
			render(RaceHeading, { ...base, links: LINKS });
			const title = titleButton()!;
			expect(getComputedStyle(title).userSelect).not.toBe('none');

			const nameSpan = title.querySelectorAll('span')[1];
			window.getSelection()!.selectAllChildren(nameSpan);
			title.click();
			// 開くなら同じ tick のうちに aria-expanded が変わる。少し待っても閉じたまま。
			await new Promise((r) => setTimeout(r, 50));
			expect(menu()).toBeNull();
			expect(title.getAttribute('aria-expanded')).toBe('false');

			window.getSelection()!.removeAllRanges();
			title.click();
			await expect.poll(() => items().length).toBe(LINKS.length);
		});

		it('⋯ から開いて Esc で閉じると、フォーカスが ⋯ に戻る', async () => {
			render(RaceHeading, { ...base, links: LINKS });
			const button = menuButton()!;

			await userEvent.click(button);
			await expect.poll(() => items().length).toBe(LINKS.length);

			await userEvent.keyboard('{Escape}');
			await expect.poll(() => menu()).toBeNull();
			await expect.poll(() => document.activeElement).toBe(button);
		});

		it('320px で長いレース名でも、レース名だけが … になり、⋯ が右端に収まる', () => {
			narrow();
			render(RaceHeading, { ...base, name: LONG_NAME, links: LINKS });

			const { meeting, name } = spans();
			expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
			expect(getComputedStyle(name).textOverflow).toBe('ellipsis');

			// 1行目は1行のまま。
			expect(h1().getBoundingClientRect().height).toBeCloseTo(
				meeting.getBoundingClientRect().height,
				0
			);
			expect(meeting.scrollWidth).toBe(meeting.clientWidth);

			// ⋯ は 1行目と同じ高さの帯に収まり、body の幅を超えない。
			const right = menuButton()!.getBoundingClientRect().right;
			expect(right).toBeLessThanOrEqual(document.body.getBoundingClientRect().right);
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
				document.documentElement.clientWidth
			);
		});
	});
});
