export type RaceHeadingSource = {
	date: string;
	course: string;
	raceNumber: number | null;
	grade: string | null;
	className: string | null;
	surface: string | null;
	distance: number | null;
	direction: string | null;
	trackCondition: string | null;
	weather: string | null;
};

/**
 * 「中山11R」。`RaceHeading` の1行目の、詰めずに必ず出す部分。
 *
 * ふりかえりと予想の見出しはここを通して組む。画面ごとに組むと、日付を1行目に置くか
 * 2行目に置くかがずれて、2つを行き来したときに同じレースの見出しに見えなくなる。
 */
export function raceMeeting(r: RaceHeadingSource): string {
	return `${r.course}${r.raceNumber ?? ''}R`;
}

/**
 * 「2026-10-04 · 芝1800m / 左 / 良 / 晴」。`RaceHeading` の2行目に出す、日付と条件。
 *
 * 馬場状態と天気は当日に決まるので、開催前のレースでは出ない。
 * `extra` は画面ごとに条件の末尾へ足すもの（予想画面の頭数）。
 */
export function raceSpec(r: RaceHeadingSource, extra: string[] = []): string {
	const spec = [
		// 重賞は見出しの格の札で分かるが、条件戦は条件がレースの識別子になる。
		r.grade ? '' : (r.className ?? ''),
		r.surface && r.distance ? `${r.surface}${r.distance}m` : (r.surface ?? ''),
		r.direction ?? '',
		r.trackCondition ?? '',
		r.weather ?? '',
		...extra
	].filter(Boolean);
	return [r.date, spec.join(' / ')].filter(Boolean).join(' · ');
}
