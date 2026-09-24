import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import CourseMap from './CourseMap.svelte';

describe('CourseMap', () => {
	it('レースの馬場の図と、回り・直線・高低差を出す', async () => {
		render(CourseMap, {
			race: { course: '東京', surface: '芝', distance: 2400, direction: '左' }
		});

		const img = page.getByRole('img', { name: '東京競馬場のコース図（芝）' });
		await expect.element(img).toBeInTheDocument();
		expect(img.element().getAttribute('src')).toContain('tokyo-turf');
		// 読み込む前から場所を取っておく（図が出た瞬間に下の入力欄がずれないように）。
		expect(Number(img.element().getAttribute('width'))).toBeGreaterThan(0);
		expect(Number(img.element().getAttribute('height'))).toBeGreaterThan(0);
		const facts = page.getByRole('listitem').elements();
		expect(facts.map((li) => li.textContent)).toEqual(['左回り', '直線 525.9m', '高低差 2.7m']);
	});

	it('図が無いレースでは何も出さない', () => {
		const { container } = render(CourseMap, {
			race: { course: '大井', surface: 'ダート', distance: 2000, direction: null }
		});
		expect(container.querySelector('figure')).toBeNull();
	});
});
