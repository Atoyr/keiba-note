import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { answerCheck } from '$lib/utils/answer';
import type { Mark } from '$lib/schemas/note';
import AnswerCheck from './AnswerCheck.svelte';

const answers = (rows: [Mark | null, number, number | null][]) =>
	answerCheck(
		rows.map(([mark, horseNumber, finishPosition]) => ({
			entryId: `e${horseNumber}`,
			horseName: `ホース${horseNumber}`,
			mark,
			horseNumber,
			finishPosition
		}))
	);

const items = (root: HTMLElement) =>
	[...root.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());

describe('AnswerCheck', () => {
	it('印の順に、着順と馬券内／着外を並べる', async () => {
		const screen = render(AnswerCheck, {
			answers: answers([
				[null, 1, 1],
				['○', 3, 1],
				['◎', 5, 9],
				['×', 7, 2]
			])
		});

		await expect.element(screen.getByRole('heading', { name: '答え合わせ' })).toBeInTheDocument();
		expect(items(screen.container)).toEqual([
			'◎ 5 ホース5 9着 着外',
			'○ 3 ホース3 1着 馬券内',
			'× 7 ホース7 2着 馬券内'
		]);
	});

	// 「当たり／外れ」「的中」は使わない。的中は馬券に使う言葉で、このアプリは馬券を記録していない。
	it('当たり・外れ・的中とは言わない', () => {
		const screen = render(AnswerCheck, {
			answers: answers([
				['◎', 1, 1],
				['○', 2, 9]
			])
		});

		expect(screen.container.textContent).not.toMatch(/当たり|外れ|的中/);
	});

	it('着順が決まった ◎○▲△ だけで馬券内の頭数を数える', async () => {
		const screen = render(AnswerCheck, {
			answers: answers([
				['◎', 1, 2],
				['○', 2, 5],
				['▲', 3, null],
				['×', 4, 1]
			])
		});

		await expect.element(screen.getByText('◎○▲△ 2頭中 1頭 馬券内')).toBeInTheDocument();
		expect(items(screen.container)).toContain('▲ 3 ホース3 — 未確定');
	});

	// 消した馬に来られたのは読み違い。言葉は「馬券内」のまま、色で目立たせる。
	it('× が馬券内なら、読みどおりの馬券内とは別の色で出す', async () => {
		const screen = render(AnswerCheck, {
			answers: answers([
				['◎', 1, 1],
				['×', 2, 2]
			])
		});

		await expect.element(screen.getByTitle('消した馬が馬券内')).toHaveClass(/text-amber-700/);
		const labels = [...screen.container.querySelectorAll('li span.w-12')];
		expect(labels[0]?.className).toMatch(/text-red-700/);
	});

	// 印を付けていないレースに空の枠が出ると、何かが壊れているように見える。
	it('印を1つも付けていなければ何も出さない', () => {
		const screen = render(AnswerCheck, { answers: answers([[null, 1, 1]]) });

		expect(screen.container.querySelector('section')).toBeNull();
	});
});
