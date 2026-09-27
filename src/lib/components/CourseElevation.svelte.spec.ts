import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import CourseElevation from './CourseElevation.svelte';
import { courseMap } from '$lib/utils/course';
import '../../routes/layout.css';

const SPRINT = { course: '中山', surface: '芝', distance: 1200, direction: '右' };

describe('CourseElevation', () => {
	it('高低断面を1枚の絵として読み上げ、目盛りの文字を出す', async () => {
		render(CourseElevation, { profile: courseMap(SPRINT)!.profile! });

		const chart = page.getByRole('img', { name: /^高低断面図/ });
		await expect.element(chart).toBeVisible();
		expect(chart.element().getAttribute('aria-label')).toContain('スタート +1.5m');
		await expect.element(page.getByText('ゴール', { exact: true })).toBeVisible();
		await expect.element(page.getByText('スタート', { exact: true })).toBeVisible();
		await expect.element(page.getByText('直線', { exact: true })).toBeVisible();
	});

	it('右回りはゴールが左、左回りはゴールが右', async () => {
		const left = render(CourseElevation, { profile: courseMap(SPRINT)!.profile! });
		const x = (text: string, container: HTMLElement) =>
			[...container.querySelectorAll('span')]
				.find((s) => s.textContent === text)!
				.getBoundingClientRect().x;
		expect(x('ゴール', left.container)).toBeLessThan(x('スタート', left.container));
		left.unmount();

		const right = render(CourseElevation, {
			profile: courseMap({ course: '東京', surface: '芝', distance: 2400, direction: '左' })!
				.profile!
		});
		expect(x('ゴール', right.container)).toBeGreaterThan(x('スタート', right.container));
	});
});
