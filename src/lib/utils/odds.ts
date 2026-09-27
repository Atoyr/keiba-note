/**
 * オッズまわりの純関数。取りに行く時間帯の判定と、画面での書き方。
 *
 * 時刻は JST 固定（docs/product.md 第9章 #7）。Worker がどこで動いても同じになるよう、
 * ローカルタイムゾーンを経由せず UTC のミリ秒で計算する。
 */

// scripts/odds/（Node で直接動く）からも読むので、拡張子まで書く
import { addDays } from './date.ts';

/**
 * オッズを取りに行く格と、何日前の何時（JST）から取りに行くか。前日発売のオッズが出始める頃に合わせる。
 * **ここに無い格（L・OP・条件戦）は取りに行かない。**
 */
const ODDS_OPENS = {
	// 金曜から売る G1 があるので、前々日から見に行く。まだ出ていなければ何も保存しない
	G1: { daysBefore: 2, time: '18:30' },
	G2: { daysBefore: 1, time: '18:30' },
	G3: { daysBefore: 1, time: '18:30' }
} as const satisfies Record<string, { daysBefore: number; time: string }>;

type OddsGrade = keyof typeof ODDS_OPENS;

function isOddsGrade(grade: string | null): grade is OddsGrade {
	return grade !== null && Object.hasOwn(ODDS_OPENS, grade);
}

/** オッズを取りに行く格。`targetsSql`（scripts/odds/store.ts）が D1 で先に絞るのに使う。 */
export const ODDS_GRADES = Object.keys(ODDS_OPENS) as OddsGrade[];

/** `YYYY-MM-DD` と `HH:MM`（JST）→ その時刻。形が違えば null。 */
export function startsAt(date: string, startTime: string): Date | null {
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const t = /^(\d{1,2}):(\d{2})$/.exec(startTime);
	if (!d || !t) return null;
	const [y, m, day] = d.slice(1).map(Number);
	const [h, mi] = t.slice(1).map(Number);
	if (h > 23 || mi > 59) return null;
	return new Date(Date.UTC(y, m - 1, day, h - 9, mi));
}

/**
 * オッズを取りに行き始める時刻。格で決める。取りに行かない格なら null。
 *
 * - G1 … 前々日の 18:30（金曜から売る G1 がある）
 * - G2・G3 … 前日の 18:30（前日発売のオッズが出始める頃）
 * - L・OP・条件戦 … 取りに行かない
 *
 * 発売前なら取得元は予想オッズしか返さず、parser が読まないので何も保存されない。
 */
export function oddsWindowOpens(date: string, grade: string | null): Date | null {
	if (!isOddsGrade(grade)) return null;
	const opens = ODDS_OPENS[grade];
	return startsAt(addDays(date, -opens.daysBefore), opens.time);
}

/**
 * いまオッズを取りに行ってよいか。**取りに行き始める時刻（`oddsWindowOpens`）から発走まで。**
 *
 * 発走後は締め切られて変わらない（確定オッズは結果と一緒に YAML の `odds` で入る）。
 * 取りに行く回数をこの幅に絞ることが、取得元への負荷を抑える主な手段。
 * 取りに行かない時間帯（JST 25:00〜7:00）は Cron の側（wrangler.toml）で決めている。
 */
export function inOddsWindow(
	date: string,
	startTime: string,
	grade: string | null,
	now: Date
): boolean {
	const start = startsAt(date, startTime);
	const opens = oddsWindowOpens(date, grade);
	if (!start || !opens) return false;
	const t = now.getTime();
	return t >= opens.getTime() && t <= start.getTime();
}

/** 単勝。値が無ければ `-`。 */
export function formatWinOdds(value: number | null): string {
	return value === null ? '-' : value.toFixed(1);
}

/** 複勝の幅。`1.4-1.8`。値が無ければ `-`。 */
export function formatPlaceOdds(min: number | null, max: number | null): string {
	if (min === null || max === null) return '-';
	return `${min.toFixed(1)}-${max.toFixed(1)}`;
}

const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
	timeZone: 'Asia/Tokyo',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

/**
 * 「9/27 14:30時点」。日付も付けるのは、前日の値が残っているときに今日の値と取り違えないため。
 * 「現在」「リアルタイム」とは書かない（30分おきにしか取っていない）。
 */
export function formatOddsAsOf(iso: string): string {
	const parts = Object.fromEntries(
		TIME_FORMATTER.formatToParts(new Date(iso)).map((p) => [p.type, p.value])
	);
	return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}時点`;
}

/**
 * 単勝オッズから人気を付ける。**オッズが低い順に 1人気、2人気…**
 *
 * 取得元の人気は票数で決まるが、ここにあるのはオッズだけなので、オッズで順を付ける。
 * 同じオッズは同じ人気にし、次はその頭数ぶん飛ばす（3.4 / 5.1 / 5.1 / 8.0 → 1 / 2 / 2 / 4）。
 * オッズの無い馬（取消・発売前）には付けない。
 *
 * 返すのは馬番 → 人気。
 */
export function popularityByNumber(
	horses: { horseNumber: number; winOdds: number | null }[]
): Map<number, number> {
	const priced = horses.filter(
		(h): h is { horseNumber: number; winOdds: number } => h.winOdds !== null
	);
	return new Map(
		priced.map((h) => [h.horseNumber, 1 + priced.filter((o) => o.winOdds < h.winOdds).length])
	);
}

/**
 * 人気順に並べ替えた写し。人気の無い馬（取消・馬番未定）は後ろに回し、
 * 同じ人気どうしと人気の無い馬どうしは馬番の順（馬番も無ければ元の順）にする。
 */
export function sortByPopularity<
	T extends { popularity: number | null; horseNumber: number | null }
>(rows: T[]): T[] {
	// 人気も馬番も18までなので、それより大きい数で後ろに回す（Infinity 同士の差は NaN になる）
	const last = 99;
	return [...rows].sort(
		(a, b) =>
			(a.popularity ?? last) - (b.popularity ?? last) ||
			(a.horseNumber ?? last) - (b.horseNumber ?? last)
	);
}
