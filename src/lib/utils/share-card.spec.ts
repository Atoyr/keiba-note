import { describe, expect, it } from 'vitest';
import type { RaceSummary } from './race-summary';
import {
	cardDescription,
	cardTitle,
	fitText,
	markedRows,
	raceSummaryCardSvg,
	textWidth,
	wrapText
} from './share-card';

type Row = RaceSummary['rows'][number];

const row = (
	mark: Row['mark'],
	horseNumber: number | null,
	horseName = `馬${horseNumber}`
): Row => ({
	mark,
	horseNumber,
	horseName,
	bracket: horseNumber ? Math.ceil(horseNumber / 2) : null,
	body: '',
	tags: []
});

const summary = (overrides: Partial<RaceSummary> = {}): RaceSummary => ({
	race: {
		name: '天皇賞（秋）',
		meeting: '東京11R',
		spec: '2026-11-01 · 芝2000m / 左',
		grade: 'G1'
	},
	body: '',
	rows: [],
	...overrides
});

/** SVG の中の `<text>` の中身を、出てくる順に。 */
const texts = (svg: string) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe('markedRows', () => {
	it('印を付けた馬だけを、まとめと同じ順（印順、同じ印は馬番順）に並べる', () => {
		const rows = [row(null, 1), row('△', 2), row('◎', 9), row('○', 3), row('◎', 4)];
		expect(markedRows(summary({ rows })).map((r) => `${r.mark}${r.horseNumber}`)).toEqual([
			'◎4',
			'◎9',
			'○3',
			'△2'
		]);
	});
});

describe('cardTitle', () => {
	it('開催とレース名。レース名が無ければ開催だけ', () => {
		expect(cardTitle(summary())).toBe('東京11R 天皇賞（秋） 予想まとめ');
		expect(cardTitle(summary({ race: { ...summary().race, name: null } }))).toBe(
			'東京11R 予想まとめ'
		);
	});
});

describe('cardDescription', () => {
	it('公開名と印の並び。馬番が未確定なら馬名だけ', () => {
		const rows = [row('○', 5, 'リバティアイランド'), row('◎', null, 'ドウデュース'), row(null, 1)];
		expect(cardDescription(summary({ rows }), '週末うまメモ')).toBe(
			'週末うまメモ の予想｜◎ドウデュース ○5 リバティアイランド'
		);
	});
	it('印が無ければ見立ての頭。見立ても無ければ公開名だけ', () => {
		expect(
			cardDescription(summary({ body: '前半は\n落ち着く', rows: [row(null, 1)] }), '匿名')
		).toBe('匿名 の予想｜前半は 落ち着く');
		expect(cardDescription(summary(), '匿名')).toBe('匿名 の予想');
	});
	it('120字で切る', () => {
		const text = cardDescription(summary({ body: 'あ'.repeat(300) }), '匿名');
		expect([...text]).toHaveLength(120);
		expect(text.endsWith('…')).toBe(true);
	});
});

describe('文字の幅', () => {
	it('半角は全角の 0.6 倍で見積もる', () => {
		expect(textWidth('東京11R', 10)).toBeCloseTo(38);
	});
	it('収まらなければ末尾を … にして、幅に収める', () => {
		expect(fitText('ドウデュース', 10, 100)).toBe('ドウデュース');
		const fitted = fitText('アスクビクターモア', 10, 50);
		expect(fitted).toBe('アスクビ…');
		expect(textWidth(fitted, 10)).toBeLessThanOrEqual(50);
	});
	it('字の単位で折り返し、行数を超えたら最後の行を … にする', () => {
		expect(wrapText('あいうえおかき\n\nくけ', 10, 30, 5)).toEqual([
			'あいう',
			'えおか',
			'き',
			'くけ'
		]);
		expect(wrapText('あいうえおかき', 10, 30, 2)).toEqual(['あいう', 'えお…']);
	});
});

describe('raceSummaryCardSvg', () => {
	it('見出し・印・枠と馬番・馬名・公開名を描く', () => {
		const rows = [row('◎', 1, 'ドウデュース'), row('○', 5, 'リバティアイランド'), row(null, 3)];
		const svg = raceSummaryCardSvg(summary({ rows }), '週末うまメモ');
		expect(svg).toMatch(/^<svg [^>]*width="1200" height="630"/);
		expect(texts(svg)).toEqual([
			'予想まとめ',
			'東京11R',
			'天皇賞（秋）',
			'G1',
			'2026-11-01 · 芝2000m / 左',
			'◎',
			'1',
			'1',
			'ドウデュース',
			'○',
			'3',
			'5',
			'リバティアイランド',
			'週末うまメモ の予想',
			'uma-memo'
		]);
	});
	it('公開名や馬名に入った記号は、SVG のタグにならないよう逃がす', () => {
		const svg = raceSummaryCardSvg(
			summary({ rows: [row('◎', 1, '<b>&"\'')] }),
			'<script>alert(1)</script>'
		);
		expect(svg).not.toContain('<script>');
		expect(svg).not.toContain('<b>');
		expect(svg).toContain('&lt;b&gt;&amp;&quot;&apos;');
	});
	it('6頭からは2列。10頭を超えたら9頭と「ほか n 頭」', () => {
		const rows = Array.from({ length: 12 }, (_, i) => row('△', i + 1));
		const drawn = texts(raceSummaryCardSvg(summary({ rows }), '匿名'));
		expect(drawn.filter((t) => t === '△')).toHaveLength(9);
		expect(drawn).toContain('ほか 3 頭');
		expect(drawn).toContain('馬9');
		expect(drawn).not.toContain('馬10');
	});
	it('枠が未確定なら馬番だけ、馬番も無ければ印と馬名だけ', () => {
		const rows = [
			{ ...row('◎', 7, '馬番だけ'), bracket: null },
			{ ...row('○', null, '印だけ'), bracket: null }
		];
		expect(texts(raceSummaryCardSvg(summary({ rows }), '匿名')).slice(5, 10)).toEqual([
			'◎',
			'7',
			'馬番だけ',
			'○',
			'印だけ'
		]);
	});
	it('印が1つも無ければ、レースの見立ての頭を描く', () => {
		const drawn = texts(
			raceSummaryCardSvg(summary({ body: '直線の末脚を重視', rows: [row(null, 1)] }), '匿名')
		);
		expect(drawn).toContain('レースの見立て');
		expect(drawn).toContain('直線の末脚を重視');
		expect(drawn).not.toContain('馬1');
	});
	it('見立ても無ければ、印の無いメモの頭数を出す', () => {
		const drawn = texts(
			raceSummaryCardSvg(summary({ rows: [row(null, 1), row(null, 2)] }), '匿名')
		);
		expect(drawn).toContain('各馬のメモ 2 頭（印なし）');
	});
});
