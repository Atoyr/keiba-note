import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RaceLaps from './RaceLaps.svelte';

const laps = [12.6, 11.4, 12.0, 12.5, 12.4, 12.2, 11.6, 11.2, 11.8];

describe('RaceLaps', () => {
	it('既定は畳み、閉じた行に前半3F・後半3Fと差を出す', () => {
		const screen = render(RaceLaps, { laps, distance: 1800 });

		const summary = screen.container.querySelector('summary')!;
		expect(summary.textContent?.replace(/\s+/g, ' ')).toContain(
			'前半3F 36.0 · 後半3F 34.6 （後半が1.4秒速い）'
		);
		expect(screen.container.querySelector('details')?.open).toBe(false);
		// 予想のペースを渡していなければ出さない。
		expect(summary.textContent).not.toContain('予想のペース');
	});

	it('開くと折れ線と区間タイムの1行が出る。折れ線は読み上げで区間タイムと前後半が読める', async () => {
		const screen = render(RaceLaps, { laps, distance: 1800 });
		screen.container.querySelector('summary')!.click();

		await expect
			.element(screen.getByRole('img', { name: /前半3F 36.0、後半3F 34.6/ }))
			.toBeVisible();
		expect(screen.container.textContent?.replace(/\s+/g, '')).toContain(
			'12.6-11.4-12.0-12.5-12.4-12.2-11.6-11.2-11.8'
		);
	});

	it('予想でペースを選んでいたら、閉じた行に並べる', () => {
		const screen = render(RaceLaps, { laps, distance: 1800, predictedPace: 'スロー' });

		expect(screen.container.querySelector('summary')?.textContent).toMatch(/予想のペース\s*スロー/);
	});

	it('最初の区間が端数（2500m の 100m）なら、折れ線の左端を「100m」とし、描かないことを書き添える', () => {
		const long = [7.3, 11.4, 11.7, 13.1, 12.6, 12.2, 12.2, 12.1, 11.8, 11.4, 11.2, 11.2, 11.6];
		const screen = render(RaceLaps, { laps: long, distance: 2500 });
		const text = screen.container.textContent ?? '';
		expect(text).toContain('100m');
		expect(text).not.toContain('スタート');
		expect(text).toContain('最初の100mは折れ線に入れない');
		// 区間タイムの1行には端数の区間も出す。
		expect(text.replace(/\s+/g, '')).toContain('7.3-11.4-11.7');
	});
});
