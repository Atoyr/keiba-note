import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CourseFeatures from './CourseFeatures.svelte';
import '../../routes/layout.css';

const course = { start: 'S文。', middle: 'M文。', finish: 'F文。', tendency: 'T文。' };

describe('CourseFeatures', () => {
	it('見出しに条件が付き、4項目と注記が出る', async () => {
		const screen = render(CourseFeatures, {
			race: { course: '東京', surface: '芝', distance: 2000 },
			course
		});

		const region = screen.getByRole('region', { name: /コースの特徴/ });
		await expect.element(region).toHaveTextContent('東京 芝2000m');
		const terms = [...screen.container.querySelectorAll('dt')].map((d) => d.textContent);
		expect(terms).toEqual(['スタート', '道中', 'ゴール前', '展開と傾向']);
		const defs = [...screen.container.querySelectorAll('dd')].map((d) => d.textContent);
		expect(defs).toEqual(['S文。', 'M文。', 'F文。', 'T文。']);
		await expect.element(region).toHaveTextContent('独自にまとめた目安です。');
	});

	it('馬場か距離が未定なら条件は付けない', async () => {
		const screen = render(CourseFeatures, {
			race: { course: '東京', surface: null, distance: null },
			course
		});
		expect(screen.container.querySelector('h2')!.textContent!.trim()).toBe('コースの特徴');
	});
});
