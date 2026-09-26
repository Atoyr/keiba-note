import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { emptyFlow, type RaceFlow } from '$lib/schemas/race-flow';
import RaceFlowEditor from './RaceFlowEditor.svelte';

const horses = [
	{ entryId: 'e1', horseNumber: 1, bracket: 1, horseName: 'ホースA' },
	{ entryId: 'e3', horseNumber: 3, bracket: 2, horseName: 'ホースC' },
	{ entryId: 'e5', horseNumber: 5, bracket: 3, horseName: 'ホースE' }
];

const hidden = (container: HTMLElement, phase: string) =>
	container.querySelector<HTMLInputElement>(`input[name="flowSpots.${phase}"]`)!;

const spotsOf = (container: HTMLElement, phase: string) =>
	JSON.parse(hidden(container, phase).value) as { entryId: string; x: number; y: number }[];

function setup(value: RaceFlow | null = null, leadsRight = false) {
	const screen = render(RaceFlowEditor, { horses, value, leadsRight });
	const inputs: string[] = [];
	// 置くたびに `input` が泡立って届くこと（DraftKeeper はフォームでこれを聞いて未保存を数える）。
	screen.container.addEventListener('input', (e) =>
		inputs.push((e.target as HTMLInputElement).name)
	);
	return { screen, inputs };
}

describe('RaceFlowEditor', () => {
	it('畳んでいる間は、ペースと隊列の1行だけを出す', async () => {
		const value: RaceFlow = {
			...emptyFlow(),
			pace: 'スロー',
			start: {
				spots: [
					{ entryId: 'e5', x: 0, y: 0 },
					{ entryId: 'e3', x: 1, y: 0 },
					{ entryId: 'e1', x: 1, y: 1 }
				],
				memo: ''
			}
		};
		const { screen } = setup(value);

		const summary = screen.container.querySelector('summary')!;
		expect(summary.textContent).toContain('スロー');
		expect(summary.textContent).toContain('スタート ⑤-③①');
		expect(screen.container.querySelector('details')!.open).toBe(false);
	});

	/** 数だけだと何の数か読めない。 */
	it('局面のタブに、置いた頭数を「頭」付きで出す', async () => {
		const { screen } = setup({
			...emptyFlow(),
			corner4: { spots: [{ entryId: 'e1', x: 0, y: 0 }], memo: '' }
		});
		await screen.getByText('展開の予想').click();
		await expect.element(screen.getByRole('tab', { name: /^4コーナー\s*1頭$/ })).toBeVisible();
		await expect.element(screen.getByRole('tab', { name: 'スタート', exact: true })).toBeVisible();
	});

	it('何も書いていなければ「＋ 書く」', async () => {
		const { screen } = setup();
		expect(screen.container.querySelector('summary')!.textContent).toContain('＋ 書く');
	});

	it('馬を選んでマスを押すと置け、hidden の欄に入って input が届く', async () => {
		const { screen, inputs } = setup();
		await screen.getByText('展開の予想').click();

		await screen.getByRole('button', { name: '3番 ホースC' }).click();
		await expect
			.element(screen.getByText('を選んでいます。置くマスを押してください'))
			.toBeVisible();
		await screen.getByRole('button', { name: '先頭・内（空き）' }).first().click();

		await expect
			.poll(() => spotsOf(screen.container, 'start'))
			.toEqual([{ entryId: 'e3', x: 0, y: 0 }]);
		expect(inputs).toContain('flowSpots.start');
		// 置いた馬は未配置の並びから消え、盤面のコマになる。
		const pool = screen.getByRole('group', { name: 'まだ置いていない馬' }).element();
		expect([...pool.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
			'1番 ホースA',
			'5番 ホースE'
		]);
		await expect
			.element(screen.getByRole('button', { name: '3番 ホースC（先頭・内）' }))
			.toBeVisible();
	});

	it('置いた馬を選んで別の馬のマスを押すと入れ替わる', async () => {
		const value: RaceFlow = {
			...emptyFlow(),
			start: {
				spots: [
					{ entryId: 'e1', x: 0, y: 0 },
					{ entryId: 'e3', x: 2, y: 1 }
				],
				memo: ''
			}
		};
		const { screen } = setup(value);
		await screen.getByText('展開の予想').click();

		await screen.getByRole('button', { name: '1番 ホースA（先頭・内）' }).click();
		await screen.getByRole('button', { name: '3番 ホースC（前から3列目・中）' }).click();

		await expect
			.poll(() => spotsOf(screen.container, 'start'))
			.toEqual([
				{ entryId: 'e3', x: 0, y: 0 },
				{ entryId: 'e1', x: 2, y: 1 }
			]);
	});

	it('盤面から外すと未配置に戻る', async () => {
		const value: RaceFlow = {
			...emptyFlow(),
			start: { spots: [{ entryId: 'e1', x: 0, y: 0 }], memo: '' }
		};
		const { screen } = setup(value);
		await screen.getByText('展開の予想').click();

		await screen.getByRole('button', { name: '1番 ホースA（先頭・内）' }).click();
		await screen.getByRole('button', { name: '盤面から外す' }).click();

		await expect.poll(() => spotsOf(screen.container, 'start')).toEqual([]);
		// 押したボタンは消えるので、フォーカスは盤面のマスへ戻る（行き先を失わない）。
		await expect.poll(() => document.activeElement?.hasAttribute('data-cell')).toBe(true);
		await expect
			.element(screen.getByRole('button', { name: '1番 ホースA', exact: true }))
			.toBeVisible();
	});

	/** 4角はスタートの並びを少し動かすだけのことが多い。前の局面から始められるようにする。 */
	it('前の局面の並びを写せる', async () => {
		const value: RaceFlow = {
			...emptyFlow(),
			start: { spots: [{ entryId: 'e5', x: 0, y: 0 }], memo: '' }
		};
		const { screen } = setup(value);
		await screen.getByText('展開の予想').click();
		await screen.getByRole('tab', { name: /4コーナー/ }).click();

		await screen.getByRole('button', { name: 'スタートの並びを写す' }).click();

		await expect
			.poll(() => spotsOf(screen.container, 'corner4'))
			.toEqual([{ entryId: 'e5', x: 0, y: 0 }]);
		// スタートの盤面はそのまま。
		expect(spotsOf(screen.container, 'start')).toEqual([{ entryId: 'e5', x: 0, y: 0 }]);
	});

	/** 下書きの復元（DraftKeeper）は hidden の値を書き換えて change を投げる。 */
	it('hidden の欄に change が来たら、盤面を読み直す', async () => {
		const { screen } = setup();
		const input = hidden(screen.container, 'finish');
		input.value = JSON.stringify([{ entryId: 'e1', x: 4, y: 3 }]);
		input.dispatchEvent(new Event('change'));

		await expect
			.poll(() => screen.container.querySelector('summary')!.textContent)
			.toContain('ゴール前 ①');
	});

	it('左回りは先頭を右に描く', async () => {
		const { screen } = setup(null, true);
		await screen.getByText('展開の予想').click();
		await expect.element(screen.getByText('進行方向 →').first()).toBeInTheDocument();

		// 盤面の1行目の右端のマスが先頭。
		const board = screen.getByRole('group', { name: 'スタートの隊列' }).element();
		const cells = board.querySelectorAll('button');
		expect(cells[9].getAttribute('aria-label')).toBe('先頭・内（空き）');
		expect(cells[0].getAttribute('aria-label')).toBe('前から10列目・内（空き）');
	});
});
