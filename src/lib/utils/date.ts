/**
 * 日付まわり。JST 固定（docs/design.md 第9章 #7）。
 *
 * 日付は `YYYY-MM-DD` の文字列で扱い、計算は UTC のミリ秒に直して行う。
 * ローカルタイムゾーンを経由すると、Worker がどこで動いても JST になる保証が崩れる。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const JST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Tokyo',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** JST の今日を `YYYY-MM-DD` で返す。 */
export function todayJst(now: Date = new Date()): string {
	return JST_FORMATTER.format(now);
}

/** `YYYY-MM-DD` → その日の 00:00 UTC のミリ秒。日付同士の加減算に使う。 */
function toEpoch(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

function toDateString(epoch: number): string {
	return new Date(epoch).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` に日数を足す。 */
export function addDays(date: string, days: number): string {
	return toDateString(toEpoch(date) + days * DAY_MS);
}

export type Week = { start: string; end: string };

/** その日を含む週の月曜（JST）。週の基準。 */
function mondayOf(date: string): string {
	const dayOfWeek = new Date(toEpoch(date)).getUTCDay(); // 0=日 … 6=土
	return addDays(date, -((dayOfWeek + 6) % 7)); // 月=0 … 日=6
}

/**
 * 週の終わり。基本は日曜（＝週末開催の最終日）。
 *
 * ただし連休は月曜・火曜まで開催がある。日曜で切ると同じ開催の月曜・火曜が
 * 「来週」に落ち、予想の入口から消える。そこで**土日から途切れずレースが続く間だけ**
 * 火曜まで伸ばす。
 *
 * 伸ばす根拠は登録済みのレースそのもので、祝日カレンダーは持たない。
 * JRA が月曜に開催するのは連休のときだけなので、月曜にレースがある事実が連休の印になる。
 */
function weekEnd(monday: string, raceDates: ReadonlySet<string>): string {
	let end = addDays(monday, 6); // 日曜
	for (let i = 0; i < 2; i++) {
		// 月曜、その次に火曜。途切れたらそこまで
		const next = addDays(end, 1);
		if (!raceDates.has(next)) break;
		end = next;
	}
	return end;
}

/**
 * 月曜を基準にした1週間。前の週が月曜・火曜まで伸びているぶんは、その週に譲る。
 *
 * 譲らないと連休の月曜が「先週」と「今週」の両方に出る。同じレースが2つの週に
 * 出てくると、どちらが済んだ開催なのか読めなくなる。
 */
function weekOf(monday: string, raceDates: ReadonlySet<string>): Week {
	const prevEnd = weekEnd(addDays(monday, -7), raceDates);
	return {
		start: prevEnd >= monday ? addDays(prevEnd, 1) : monday,
		end: weekEnd(monday, raceDates)
	};
}

/**
 * 「今週」= 月曜から日曜（JST）。連休は火曜まで（→ `weekEnd`）。
 *
 * JRA の開催は土日なので、週末開催の翌日（月曜）に次の週へ切り替わり、
 * その週の日曜（＝次の週末開催の最終日）で閉じる。
 * 日曜の時点ではまだその週の中にいる。
 *
 * 連休で月曜・火曜まで開催がある週だけは、その最終日まで切り替えを待つ。
 * 月曜の朝に次の週へ飛ぶと、その日走るレースが「来週」になってしまう。
 *
 * `raceDates` は開催日（`YYYY-MM-DD`）。渡さなければ常に月曜〜日曜。
 */
export function currentWeek(now: Date = new Date(), raceDates: Iterable<string> = []): Week {
	const today = todayJst(now);
	const dates = new Set(raceDates);
	const monday = mondayOf(today);

	// 月曜・火曜は、まだ前の週の開催の中にいることがある
	const prev = weekOf(addDays(monday, -7), dates);
	return prev.end >= today ? prev : weekOf(monday, dates);
}

/**
 * 週をまたいだ移動。一覧の「前の週 / 次の週」用。
 *
 * 動かすのは週の範囲ではなく基準の月曜。連休で伸び縮みした端をそのまま足すと、
 * 月曜からずれていって週が週でなくなる。
 */
export function shiftWeek(week: Week, weeks: number, raceDates: Iterable<string> = []): Week {
	return weekOf(addDays(mondayOf(week.start), weeks * 7), new Set(raceDates));
}

/**
 * 週を決めるのに読む必要がある開催日の範囲。
 *
 * 見るのは今日の週と `offset` で移動した先、それぞれの前後だけ
 * （前の週が月曜・火曜まで伸びているか / その週が伸びるか）。
 * ここを狭めると延長を取りこぼし、連休の月曜が「来週」に落ちる。
 */
export function weekLookupRange(now: Date, offset: number): { from: string; to: string } {
	const here = mondayOf(todayJst(now));
	const there = addDays(here, offset * 7);
	const [first, last] = here <= there ? [here, there] : [there, here];
	return { from: addDays(first, -7), to: addDays(last, 8) };
}

/** `2026-09-27` → `9/27(日)` の表示用。 */
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateShort(date: string): string {
	const [, m, d] = date.split('-').map(Number);
	const w = WEEKDAYS[new Date(toEpoch(date)).getUTCDay()];
	return `${m}/${d}(${w})`;
}
