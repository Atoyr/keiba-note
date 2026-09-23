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
	it('印の順に、着順と当たり外れを並べる', async () => {
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
			'◎ 5 ホース5 9着 外れ',
			'○ 3 ホース3 1着 当たり',
			'× 7 ホース7 2着 外れ'
		]);
	});

	it('着順が決まった馬だけで当たりの数を数える', async () => {
		const screen = render(AnswerCheck, {
			answers: answers([
				['◎', 1, 2],
				['○', 2, 5],
				['▲', 3, null]
			])
		});

		await expect.element(screen.getByText('2頭中 1頭 当たり')).toBeInTheDocument();
		expect(items(screen.container)).toContain('▲ 3 ホース3 — 結果待ち');
	});

	// 印を付けていないレースに空の枠が出ると、何かが壊れているように見える。
	it('印を1つも付けていなければ何も出さない', () => {
		const screen = render(AnswerCheck, { answers: answers([[null, 1, 1]]) });

		expect(screen.container.querySelector('section')).toBeNull();
	});
});
