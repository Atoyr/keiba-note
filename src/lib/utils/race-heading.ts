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
 * 「2026-10-04 東京11R」。`RaceHeading` の1行目の、詰めずに必ず出す部分。
 *
 * ふりかえりと予想の見出しはここを通して組む。画面ごとに組むと、日付を1行目に置くか
 * 2行目に置くかがずれて、2つを行き来したときに同じレースの見出しに見えなくなる。
 */
export function raceMeeting(r: RaceHeadingSource): string {
	return [r.date, `${r.course}${r.raceNumber ?? ''}R`].filter(Boolean).join(' ');
}

/**
 * 「芝1800m / 左 / 良 / 晴」。`RaceHeading` の2行目に出す条件。
 *
 * 馬場状態と天気は当日に決まるので、開催前のレースでは出ない。
 */
export function raceSpec(r: RaceHeadingSource): string[] {
	return [
		// 重賞は見出しの格の札で分かるが、条件戦は条件がレースの識別子になる。
		r.grade ? '' : (r.className ?? ''),
		r.surface && r.distance ? `${r.surface}${r.distance}m` : (r.surface ?? ''),
		r.direction ?? '',
		r.trackCondition ?? '',
		r.weather ?? ''
	].filter(Boolean);
}
