import { expect, it } from 'vitest';
import { orderedSummaryRows, type RaceSummary } from './race-summary';

const row = (
	mark: RaceSummary['rows'][number]['mark'],
	horseNumber: number | null
): RaceSummary['rows'][number] => ({
	mark,
	horseNumber,
	horseName: `馬${horseNumber}`,
	bracket: null,
	body: 'メモ',
	tags: []
});

it('印順、同じ印は馬番順。印なし本文も最後に馬番順で残し、元のコピーは変更しない', () => {
	const rows = [
		row(null, 3),
		row('×', 1),
		row('◎', 8),
		row('☆', 2),
		row('◎', 2),
		row('△', 3),
		row('○', 6),
		row('▲', 7),
		row(null, 1),
		row('◎', null)
	];
	const original = structuredClone(rows);
	expect(orderedSummaryRows(rows).map(({ mark, horseNumber }) => [mark, horseNumber])).toEqual([
		['◎', 2],
		['◎', 8],
		['◎', null],
		['○', 6],
		['▲', 7],
		['△', 3],
		['☆', 2],
		['×', 1],
		[null, 1],
		[null, 3]
	]);
	expect(rows).toEqual(original);
});
