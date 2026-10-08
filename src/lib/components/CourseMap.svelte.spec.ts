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

	it('図の下に高低断面を出す。内回り・外回りが決まらないレースには出さない', async () => {
		await page.viewport(1280, 800);
		const sprint = render(CourseMap, {
			race: { course: '中山', surface: '芝', distance: 1200, direction: '右' }
		});
		await expect.element(page.getByRole('img', { name: /^高低断面図/ })).toBeVisible();
		sprint.unmount();

		// 京都の芝1600m は内回り・外回りのどちらを走るか決まらない。
		render(CourseMap, { race: { course: '京都', surface: '芝', distance: 1600, direction: '右' } });
		await expect.element(page.getByRole('img', { name: /コース図/ })).toBeVisible();
		await expect.element(page.getByRole('img', { name: /^高低断面図/ })).not.toBeInTheDocument();
	});

	describe('スタートからゴールまでの道すじ', () => {
		/** 広い画面の枠（section）の中で、図の `<img>` の上に重ねた SVG。 */
		const overlay = () => document.querySelector('section .relative > svg');

		it('距離から道すじが引けるレースでは、図の上に黄色い線とスタートの丸を重ねる', async () => {
			await page.viewport(1280, 800);
			render(CourseMap, {
				race: { course: '東京', surface: '芝', distance: 1600, direction: '左' }
			});
			await expect
				.element(page.getByRole('img', { name: '東京競馬場のコース図（芝）' }))
				.toBeVisible();

			const svg = overlay()!;
			expect(svg).not.toBeNull();
			const path = svg.querySelector('path')!;
			expect(path.getAttribute('d')).toMatch(/^M/);
			expect(path.getAttribute('stroke')).toBe('#facc15');
			expect(svg.querySelectorAll('circle')).toHaveLength(1);
		});

		it('道すじを引けないレース（内回り外回りが決まらない芝・障害）では重ねない', async () => {
			await page.viewport(1280, 800);
			const kyoto = render(CourseMap, {
				race: { course: '京都', surface: '芝', distance: 1600, direction: '右' }
			});
			await expect.element(page.getByRole('img', { name: /コース図/ })).toBeVisible();
			expect(overlay()).toBeNull();
			kyoto.unmount();

			render(CourseMap, {
				race: { course: '中山', surface: '障害', distance: 4100, direction: '右' }
			});
			await expect.element(page.getByRole('img', { name: /コース図/ })).toBeVisible();
			expect(overlay()).toBeNull();
		});

		it('重ねた線は読み上げず、画像として見えるのは図の1枚だけ', async () => {
			await page.viewport(1280, 800);
			render(CourseMap, {
				race: { course: '東京', surface: '芝', distance: 1600, direction: '左' }
			});
			await expect
				.element(page.getByRole('img', { name: '東京競馬場のコース図（芝）' }))
				.toBeVisible();
			expect(overlay()!.getAttribute('aria-hidden')).toBe('true');
			// 図の `<img>` と、その下の高低断面（別の部品）。重ねた SVG は数えない。
			const names = page
				.getByRole('img')
				.elements()
				.map((el) => el.getAttribute('aria-label') ?? el.getAttribute('alt'));
			expect(names.filter((name) => name?.includes('コース図'))).toEqual([
				'東京競馬場のコース図（芝）'
			]);
			expect(page.getByRole('img').elements()).not.toContain(overlay());
		});

		it('右回りの図に重ねる線は左右を反転し、左回りは反転しない', async () => {
			await page.viewport(1280, 800);
			const nakayama = render(CourseMap, {
				race: { course: '中山', surface: '芝', distance: 1200, direction: '右' }
			});
			await expect.element(page.getByRole('img', { name: /コース図/ })).toBeVisible();
			expect(overlay()!.querySelector('g')!.getAttribute('transform')).toBe('scale(-1 1)');
			nakayama.unmount();

			render(CourseMap, {
				race: { course: '東京', surface: '芝', distance: 1600, direction: '左' }
			});
			await expect.element(page.getByRole('img', { name: /コース図/ })).toBeVisible();
			expect(overlay()!.querySelector('g')!.hasAttribute('transform')).toBe(false);
		});
	});

	it('図が無いレースでは何も出さない', () => {
		const { container } = render(CourseMap, {
			race: { course: '大井', surface: 'ダート', distance: 2000, direction: null }
		});
		expect(container.querySelector('figure')).toBeNull();
	});
});
