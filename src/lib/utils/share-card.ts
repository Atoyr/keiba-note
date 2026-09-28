import type { Mark } from '../schemas/note';
import { orderedSummaryRows, type RaceSummary } from './race-summary';

/**
 * 予想まとめの共有リンクを SNS に貼ったときのプレビュー（OGP）。
 *
 * X はカードに説明文を出さず画像だけを大きく出すので、**印は画像に描く**。
 * LINE・Discord・Slack などは説明文も出すので、同じ並びを文字でも持たせる。
 * どちらも共有のコピー（`race_share.content`）と公開名だけから組み、アカウントの情報は使わない。
 *
 * 画像は SVG で組み、サーバーが PNG にする（`lib/server/og/render.ts`）。ここは D1 も描画も知らない。
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
/** SVG の `font-family`。`static/og/` のフォント（scripts/og-font.ts）の名前と合わせる。 */
export const CARD_FONT = 'Noto Sans JP';

/**
 * 色は画面の札（MarkBadge・BracketBadge・HorseNumberBadge・GradeBadge）の Tailwind の色を16進にしたもの。
 * 画像の中はクラスが効かないので写してある。札の色を変えたら、ここも変える。
 */
const MARK_TONE: Record<Mark, { fill: string; stroke: string; text: string }> = {
	'◎': { fill: '#dc2626', stroke: '#dc2626', text: '#ffffff' },
	'○': { fill: '#ffedd5', stroke: '#fb923c', text: '#7c2d12' },
	'▲': { fill: '#fef3c7', stroke: '#fbbf24', text: '#78350f' },
	'△': { fill: '#e2e8f0', stroke: '#64748b', text: '#0f172a' },
	'☆': { fill: '#ede9fe', stroke: '#8b5cf6', text: '#4c1d95' },
	'×': { fill: '#f5f5f5', stroke: '#737373', text: '#171717' }
};

const BRACKET_TONE: Record<number, { fill: string; stroke: string; text: string; face: string }> = {
	1: { fill: '#ffffff', stroke: '#9ca3af', text: '#111827', face: '#ffffff' },
	2: { fill: '#111827', stroke: '#111827', text: '#ffffff', face: '#e5e7eb' },
	3: { fill: '#dc2626', stroke: '#dc2626', text: '#ffffff', face: '#fee2e2' },
	4: { fill: '#2563eb', stroke: '#2563eb', text: '#ffffff', face: '#dbeafe' },
	5: { fill: '#fde047', stroke: '#eab308', text: '#111827', face: '#fef9c3' },
	6: { fill: '#16a34a', stroke: '#16a34a', text: '#ffffff', face: '#dcfce7' },
	7: { fill: '#fb923c', stroke: '#f97316', text: '#111827', face: '#ffedd5' },
	8: { fill: '#f9a8d4', stroke: '#f472b6', text: '#111827', face: '#fce7f3' }
};

const GRADE_FILL: Record<string, string> = { G1: '#2563eb', G2: '#dc2626', G3: '#15803d' };

/** layout.css のトークン（--primary・--foreground・--muted-foreground・--border）を16進にしたもの。 */
const INK = '#171717';
const MUTED = '#737373';
const LINE = '#e5e5e5';
const PRIMARY = '#1e3a5f';

const PAD = 64;

type Row = RaceSummary['rows'][number];

/** 画像に並べる馬。印を付けた馬だけを、まとめと同じ順（印順、同じ印は馬番順）に。 */
export function markedRows(summary: RaceSummary): (Row & { mark: Mark })[] {
	return orderedSummaryRows(summary.rows).filter((r): r is Row & { mark: Mark } => !!r.mark);
}

/** 「◎1 E2Eホンメイ」。馬番が未確定なら馬名だけ。 */
const markedLabel = (r: Row & { mark: Mark }) =>
	`${r.mark}${r.horseNumber ? `${r.horseNumber} ` : ''}${r.horseName}`;

/**
 * og:title。ページの `<title>` と同じく、レース名（無ければ開催）と「予想まとめ」。
 * 誰の予想かは説明文と画像に出す。
 */
export function cardTitle(summary: RaceSummary): string {
	const { race } = summary;
	return `${race.name ? `${race.meeting} ${race.name}` : race.meeting} 予想まとめ`;
}

/**
 * og:description。印の並びを1行に。印が1つも無ければレースの見立ての頭を出す。
 * 長さは LINE や Discord が畳む前に読める程度（120字）で切る。
 */
export function cardDescription(summary: RaceSummary, authorName: string): string {
	const marked = markedRows(summary);
	const lead = `${authorName} の予想`;
	const body = marked.length
		? marked.map(markedLabel).join(' ')
		: summary.body.replace(/\s+/g, ' ').trim();
	return truncateChars(body ? `${lead}｜${body}` : lead, 120);
}

function truncateChars(s: string, max: number): string {
	const chars = [...s];
	return chars.length <= max ? s : `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * 文字の幅の見積もり（em）。描く前に幅を測る手段が無いので、太字の Noto Sans JP の字幅で近似する。
 * 半角（ASCII）は 0.6em、それ以外（かな・漢字・全角記号）は 1em。はみ出さないよう、やや広めに見る。
 */
export function textWidth(s: string, fontSize: number): number {
	let em = 0;
	for (const c of s) em += c.charCodeAt(0) < 0x80 ? 0.6 : 1;
	return em * fontSize;
}

/** 末尾に … を付け、幅に収まるまで字を削る。 */
function ellipsize(s: string, fontSize: number, maxWidth: number): string {
	const chars = [...s];
	while (chars.length && textWidth(`${chars.join('')}…`, fontSize) > maxWidth) chars.pop();
	return `${chars.join('')}…`;
}

/** 幅に収まらなければ末尾を … にする。 */
export function fitText(s: string, fontSize: number, maxWidth: number): string {
	return textWidth(s, fontSize) <= maxWidth ? s : ellipsize(s, fontSize, maxWidth);
}

/** 幅で折り返す（日本語なので字の単位で切る）。`maxLines` を超える分は最後の行を … にする。 */
export function wrapText(s: string, fontSize: number, maxWidth: number, maxLines: number) {
	const lines: string[] = [];
	for (const paragraph of s.split(/\r?\n/)) {
		let line = '';
		for (const c of paragraph) {
			if (textWidth(line + c, fontSize) > maxWidth) {
				lines.push(line);
				line = c;
			} else line += c;
		}
		lines.push(line);
	}
	const kept = lines.filter((l) => l.trim());
	if (kept.length <= maxLines) return kept;
	const shown = kept.slice(0, maxLines);
	shown[maxLines - 1] = ellipsize(shown[maxLines - 1], fontSize, maxWidth);
	return shown;
}

const escapeXml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
	);

/**
 * `<text>` を1つ。y は文字の縦の中心で指定する（札の中央に置くことが多いため）。
 * 太字の Noto Sans JP では、かな・漢字・数字の見た目の中心がベースラインから約 0.36em 上にある。
 */
function text(
	x: number,
	centerY: number,
	s: string,
	size: number,
	fill: string,
	anchor: 'start' | 'middle' | 'end' = 'start'
) {
	const y = Math.round((centerY + size * 0.36) * 10) / 10;
	return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escapeXml(s)}</text>`;
}

const rect = (x: number, y: number, w: number, h: number, fill: string, stroke?: string, r = 8) =>
	`<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${r}" fill="${fill}"${
		stroke ? ` stroke="${stroke}" stroke-width="2"` : ''
	}/>`;

const ROW_HEIGHT = 60;
const BADGE = 48;
const ROWS_TOP = 236;
const ROWS_PER_COLUMN = 5;
const COLUMN_GAP = 48;

/** 印・枠と馬番・馬名の1行。枠や馬番が未確定でも印と馬名は出す。 */
function horseRow(r: Row & { mark: Mark }, x: number, top: number, width: number): string {
	const cy = top + BADGE / 2;
	const tone = MARK_TONE[r.mark];
	const parts = [
		rect(x, top, BADGE, BADGE, tone.fill, tone.stroke),
		text(x + BADGE / 2, cy, r.mark, 30, tone.text, 'middle')
	];
	let cursor = x + BADGE + 16;
	const bracket = r.bracket ? BRACKET_TONE[r.bracket] : undefined;
	if (bracket) {
		// 画面の HorseNumberBadge と同じく、左に枠番（帽子の色）、右に馬番（枠の色を薄くした面）。
		parts.push(
			rect(cursor, top, 34, BADGE, bracket.fill, bracket.stroke, 6),
			text(cursor + 17, cy, String(r.bracket), 22, bracket.text, 'middle'),
			rect(cursor + 32, top, 52, BADGE, bracket.face, bracket.stroke, 6),
			text(cursor + 58, cy, r.horseNumber ? String(r.horseNumber) : '−', 28, '#111827', 'middle')
		);
		cursor += 84 + 16;
	} else if (r.horseNumber) {
		parts.push(
			rect(cursor, top, 52, BADGE, '#f5f5f5', LINE, 6),
			text(cursor + 26, cy, String(r.horseNumber), 28, '#111827', 'middle')
		);
		cursor += 52 + 16;
	}
	parts.push(text(cursor, cy, fitText(r.horseName, 36, x + width - cursor), 36, INK));
	return parts.join('');
}

/** 印を付けた馬の表。5頭までは1列、それより多ければ2列。入りきらない分は「ほか n 頭」。 */
function markTable(rows: (Row & { mark: Mark })[]): string {
	const twoColumns = rows.length > ROWS_PER_COLUMN;
	const capacity = twoColumns ? ROWS_PER_COLUMN * 2 : ROWS_PER_COLUMN;
	const overflow = rows.length > capacity;
	const shown = rows.slice(0, overflow ? capacity - 1 : capacity);
	const width = twoColumns ? (CARD_WIDTH - PAD * 2 - COLUMN_GAP) / 2 : CARD_WIDTH - PAD * 2;
	const at = (i: number) => ({
		x: PAD + (i < ROWS_PER_COLUMN ? 0 : width + COLUMN_GAP),
		top: ROWS_TOP + (i % ROWS_PER_COLUMN) * ROW_HEIGHT
	});
	const parts = shown.map((r, i) => {
		const { x, top } = at(i);
		return horseRow(r, x, top, width);
	});
	if (overflow) {
		const { x, top } = at(shown.length);
		parts.push(text(x, top + BADGE / 2, `ほか ${rows.length - shown.length} 頭`, 30, MUTED));
	}
	return parts.join('');
}

/** 印が1つも無いときは、レースの見立ての頭を出す。見立ても無ければ、メモの頭数だけ。 */
function outlookBlock(summary: RaceSummary): string {
	if (!summary.body.trim()) {
		const message = summary.rows.length
			? `各馬のメモ ${summary.rows.length} 頭（印なし）`
			: 'レースの展開を予想しました';
		return text(PAD, ROWS_TOP + BADGE / 2, message, 34, MUTED);
	}
	const lines = wrapText(summary.body.trim(), 34, CARD_WIDTH - PAD * 2, 5);
	return [
		text(PAD, ROWS_TOP + 14, 'レースの見立て', 26, MUTED),
		...lines.map((l, i) => text(PAD, ROWS_TOP + 68 + i * 54, l, 34, INK))
	].join('');
}

/** 共有の画像（1200×630）。SNS のカードの推奨の大きさ（1.91:1）。 */
export function raceSummaryCardSvg(summary: RaceSummary, authorName: string): string {
	const { race } = summary;
	const rows = markedRows(summary);
	const inner = CARD_WIDTH - PAD * 2;

	// 見出し。開催は必ず出し、幅が足りなければレース名を … にする（画面の RaceHeading と同じ）。
	const meetingWidth = textWidth(race.meeting, 52);
	const heading = [text(PAD, 136, race.meeting, 52, INK)];
	if (race.name) {
		heading.push(
			text(PAD + meetingWidth + 24, 136, fitText(race.name, 52, inner - meetingWidth - 24), 52, INK)
		);
	}

	const specLine: string[] = [];
	let specX = PAD;
	if (race.grade) {
		const w = textWidth(race.grade, 24) + 24;
		const fill = GRADE_FILL[race.grade];
		specLine.push(
			fill
				? rect(specX, 180, w, 36, fill, undefined, 6)
				: rect(specX, 180, w, 36, '#ffffff', MUTED, 6),
			text(specX + w / 2, 198, race.grade, 24, fill ? '#ffffff' : INK, 'middle')
		);
		specX += w + 16;
	}
	if (race.spec)
		specLine.push(text(specX, 198, fitText(race.spec, 28, PAD + inner - specX), 28, MUTED));

	const footerY = CARD_HEIGHT - 44;
	const brand = 'uma-memo';
	const brandWidth = textWidth(brand, 30);

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" font-family="${CARD_FONT}" font-weight="700">`,
		`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#ffffff"/>`,
		`<rect width="${CARD_WIDTH}" height="12" fill="${PRIMARY}"/>`,
		text(PAD, 64, '予想まとめ', 26, MUTED),
		...heading,
		...specLine,
		rows.length ? markTable(rows) : outlookBlock(summary),
		`<rect x="${PAD}" y="${CARD_HEIGHT - 88}" width="${inner}" height="2" fill="${LINE}"/>`,
		text(PAD, footerY, fitText(`${authorName} の予想`, 30, inner - brandWidth - 32), 30, INK),
		text(CARD_WIDTH - PAD, footerY, brand, 30, PRIMARY, 'end'),
		'</svg>'
	].join('');
}
