import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import CourseMap from './CourseMap.svelte';
import '../../routes/layout.css';

const TOKYO = { course: '東京', surface: '芝', distance: 2400, direction: '左' };

afterEach(async () => {
	await page.viewport(1280, 800);
});

describe('CourseMap', () => {
	it('広い画面では開いたまま、図と回り・直線・高低差を出す', async () => {
		await page.viewport(1280, 800);
		render(CourseMap, { race: TOKYO });

		const img = page.getByRole('img', { name: '東京競馬場のコース図（芝）' });
		await expect.element(img).toBeVisible();
		expect(img.element().getAttribute('src')).toContain('tokyo-turf');
		// 読み込む前から場所を取っておく（図が出た瞬間に下の入力欄がずれないように）。
		expect(Number(img.element().getAttribute('width'))).toBeGreaterThan(0);
		expect(Number(img.element().getAttribute('height'))).toBeGreaterThan(0);

		const facts = page.getByRole('listitem').elements();
		expect(facts.map((li) => li.textContent)).toEqual(['左回り', '直線 525.9m', '高低差 2.7m']);
		// スマホ用の畳んだ版は出ていない。
		await expect.element(page.getByRole('heading', { name: 'コース' })).toBeVisible();
		expect(getComputedStyle(document.querySelector('details')!).display).toBe('none');
	});

	it('スマホでは畳んでおき、見出しの行に寸法を出す。開くと図が出る', async () => {
		await page.viewport(390, 800);
		render(CourseMap, { race: TOKYO });

		const details = document.querySelector('details')!;
		expect(details.open).toBe(false);
		const summary = page.elementLocator(details.querySelector('summary')!);
		await expect.element(summary.getByText('直線 525.9m')).toBeVisible();
		await expect.element(summary.getByText('高低差 2.7m')).toBeVisible();
		await expect
			.element(page.getByRole('img', { name: '東京競馬場のコース図（芝）' }))
			.not.toBeInTheDocument();

		await page.elementLocator(details.querySelector('summary')!).click();
		expect(details.open).toBe(true);
		await expect
			.element(page.getByRole('img', { name: '東京競馬場のコース図（芝）' }))
			.toBeVisible();
	});

	it('スマホで畳んだ行は、寸法が長くても切り詰めずに折り返す', async () => {
		await page.viewport(390, 800);
		// 京都の芝1600m は内回り・外回りのどちらにもあるので、寸法が両方ぶん並んで長くなる。
		render(CourseMap, { race: { course: '京都', surface: '芝', distance: 1600, direction: '右' } });

		const summary = document.querySelector('summary')!;
		await expect.element(page.elementLocator(summary)).toBeVisible();
		expect(summary.textContent).toContain('高低差 内回り 3.1m / 外回り 4.3m');
		for (const span of summary.querySelectorAll<HTMLElement>('span.whitespace-nowrap')) {
			// 1項目ずつ、枠からはみ出さずに全部見えている。
			expect(span.scrollWidth).toBeLessThanOrEqual(span.clientWidth);
			expect(span.getBoundingClientRect().right).toBeLessThanOrEqual(
				summary.getBoundingClientRect().right
			);
		}
	});

	it('図が無いレースでは何も出さない', () => {
		const { container } = render(CourseMap, {
			race: { course: '大井', surface: 'ダート', distance: 2000, direction: null }
		});
		expect(container.querySelector('figure')).toBeNull();
	});
});
