/**
 * JRA の競馬場のコースの寸法と、コース図（`src/lib/assets/courses/*.svg`）の描き方。
 *
 * 数値は JRA の「コース紹介」（https://www.jra.go.jp/facilities/race/<場>/course/）の
 * Aコースの値（2026-09-24 に確認）。コース図はここから `pnpm run course-maps` で書き出す。
 * 図は形と大きさの見当をつけるための模式図で、実物のコースの形はなぞっていない
 * （JRA のコース図は著作物なので写さない）。
 */

/** 周回コース1本。内回り・外回りがある場は2本持つ。 */
export type CourseLoop = {
	/** 内回り・外回りの別。1本しかない場は null。 */
	name: '内回り' | '外回り' | null;
	/** 一周距離（m）。 */
	lap: number;
	/** 最後の直線の長さ（m）。 */
	straight: number;
	/** 高低差（m）。 */
	rise: number;
};

export type CourseSpec = {
	/** コース図のファイル名の頭。 */
	slug: string;
	direction: '右' | '左';
	/** 外回りを先に置く。 */
	turf: CourseLoop[];
	dirt: CourseLoop;
	/** 直線コース（新潟の芝1000m）の長さ。 */
	straightCourse?: number;
};

export const COURSE_SPECS: Record<string, CourseSpec> = {
	札幌: {
		slug: 'sapporo',
		direction: '右',
		turf: [{ name: null, lap: 1640.9, straight: 266.1, rise: 0.7 }],
		dirt: { name: null, lap: 1487, straight: 264.3, rise: 0.9 }
	},
	函館: {
		slug: 'hakodate',
		direction: '右',
		turf: [{ name: null, lap: 1626.6, straight: 262.1, rise: 3.5 }],
		dirt: { name: null, lap: 1475.8, straight: 260.3, rise: 3.5 }
	},
	福島: {
		slug: 'fukushima',
		direction: '右',
		turf: [{ name: null, lap: 1600, straight: 292, rise: 1.9 }],
		dirt: { name: null, lap: 1444.6, straight: 295.7, rise: 2.1 }
	},
	新潟: {
		slug: 'niigata',
		direction: '左',
		turf: [
			{ name: '外回り', lap: 2223, straight: 658.7, rise: 2.2 },
			{ name: '内回り', lap: 1623, straight: 358.7, rise: 0.8 }
		],
		dirt: { name: null, lap: 1472.5, straight: 353.9, rise: 0.6 },
		straightCourse: 1000
	},
	東京: {
		slug: 'tokyo',
		direction: '左',
		turf: [{ name: null, lap: 2083.1, straight: 525.9, rise: 2.7 }],
		dirt: { name: null, lap: 1899, straight: 501.6, rise: 2.5 }
	},
	中山: {
		slug: 'nakayama',
		direction: '右',
		turf: [
			{ name: '外回り', lap: 1839.7, straight: 310, rise: 5.3 },
			{ name: '内回り', lap: 1667.1, straight: 310, rise: 5.3 }
		],
		dirt: { name: null, lap: 1493, straight: 308, rise: 4.5 }
	},
	中京: {
		slug: 'chukyo',
		direction: '左',
		turf: [{ name: null, lap: 1705.9, straight: 412.5, rise: 3.5 }],
		dirt: { name: null, lap: 1530, straight: 410.7, rise: 3.4 }
	},
	京都: {
		slug: 'kyoto',
		direction: '右',
		turf: [
			{ name: '外回り', lap: 1894.3, straight: 403.7, rise: 4.3 },
			{ name: '内回り', lap: 1782.8, straight: 328.4, rise: 3.1 }
		],
		dirt: { name: null, lap: 1607.6, straight: 329.1, rise: 3 }
	},
	阪神: {
		slug: 'hanshin',
		direction: '右',
		turf: [
			{ name: '外回り', lap: 2089, straight: 473.6, rise: 2.4 },
			{ name: '内回り', lap: 1689, straight: 356.5, rise: 1.9 }
		],
		dirt: { name: null, lap: 1517.6, straight: 352.7, rise: 1.6 }
	},
	小倉: {
		slug: 'kokura',
		direction: '右',
		turf: [{ name: null, lap: 1615.1, straight: 293, rise: 3 }],
		dirt: { name: null, lap: 1445.4, straight: 291.3, rise: 2.9 }
	}
};

/** どのコースを強く描くか。 */
export type CourseMapVariant = 'turf' | 'dirt' | 'straight';

export type CourseMapSource = {
	course: string;
	surface: string | null;
	distance: number | null;
	direction: string | null;
};

export type CourseMap = {
	/** `src/lib/assets/courses/` のファイル名（拡張子なし）。 */
	file: string;
	width: number;
	height: number;
	alt: string;
	/** 図の下に並べる「左回り」「直線 525.9m」など。 */
	facts: string[];
};

const m = (n: number) => `${n.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}m`;

/** 内回りと外回りで値が違えば「内回り 328.4m / 外回り 403.7m」、同じなら1つだけ。 */
function perLoop(loops: CourseLoop[], pick: (l: CourseLoop) => number): string {
	const values = new Set(loops.map(pick));
	if (values.size === 1) return m(pick(loops[0]));
	// 内回りを先に読ませる（外回りのほうが直線が長いので、短い順に並ぶ）。
	return [...loops]
		.reverse()
		.map((l) => `${l.name} ${m(pick(l))}`)
		.join(' / ');
}

/**
 * レースに合うコース図と、その下に出す寸法。JRA の10場以外（地方・海外）と、
 * 馬場が決まっていないレースは null（どの図を出しても当てずっぽうになる）。
 */
export function courseMap(race: CourseMapSource): CourseMap | null {
	const spec = COURSE_SPECS[race.course];
	if (!spec || !race.surface) return null;

	const straightCourse =
		spec.straightCourse !== undefined &&
		race.surface === '芝' &&
		(race.direction === '直線' || race.distance === spec.straightCourse);

	// 障害は専用のコースを走るので、芝の図を出して寸法は出さない。
	const variant: CourseMapVariant = straightCourse
		? 'straight'
		: race.surface === 'ダート'
			? 'dirt'
			: 'turf';
	const { width, height } = courseMapSize(spec);

	let facts: string[];
	if (straightCourse) {
		facts = [`直線コース ${m(spec.straightCourse!)}`];
	} else if (race.surface === '障害') {
		facts = [`${spec.direction}回り`];
	} else {
		const loops = variant === 'dirt' ? [spec.dirt] : spec.turf;
		facts = [
			`${spec.direction}回り`,
			`直線 ${perLoop(loops, (l) => l.straight)}`,
			`高低差 ${perLoop(loops, (l) => l.rise)}`
		];
	}

	const surfaceLabel = straightCourse ? '芝・直線' : race.surface;
	return {
		file: `${spec.slug}-${variant}`,
		width,
		height,
		alt: `${race.course}競馬場のコース図（${surfaceLabel}）`,
		facts
	};
}

// ---------------------------------------------------------------------------
// 図の組み立て。単位はメートルで、画面には PX_PER_M を掛けた大きさで出す。
// 全場で同じ縮尺にして、東京と札幌の大きさの違いが図でも分かるようにする。
// ---------------------------------------------------------------------------

const PX_PER_M = 0.3;
/** ゴールから1コーナーまで。JRA は公表していないので、全場で同じ見当の値にする。 */
const PAST_GOAL = 60;
const TURF_WIDTH = 28;
const DIRT_WIDTH = 22;
/** 芝とダートの間にあける幅（中心線どうしではなく、帯の縁どうし）。 */
const GAP = 8;
const ARROW_GAP = 34;
const PAD = 12;

const COLOR = {
	turf: '#3d7a45',
	dirt: '#94663a',
	inactive: '#dcdcdc',
	mark: '#262626',
	arrow: '#525252'
} as const;

/** 角の中心が cx1・cx2、半径 r の陸上トラック形。y は下向き、ホームストレッチが下。 */
type Oval = { cx1: number; cx2: number; r: number };

type Layout = {
	turf: Oval[];
	dirt: Oval;
	/** 直線コースの始点と終点の x、y。 */
	straight: { x1: number; x2: number; y: number } | null;
	box: { x: number; y: number; w: number; h: number };
	arrowY: number;
	goalY1: number;
	goalY2: number;
};

/**
 * 左回りで組み立てる（ホームストレッチを左から右へ走り、ゴールは x = 0）。
 * 右回りは描くときに左右を反転する。
 */
function layout(spec: CourseSpec): Layout {
	const [outer, ...inners] = spec.turf;
	const r = (outer.lap - 2 * (outer.straight + PAST_GOAL)) / (2 * Math.PI);
	const turf: Oval[] = [{ cx1: -outer.straight, cx2: PAST_GOAL, r }];
	for (const inner of inners) {
		// 直線が同じ長さ（中山）なら、違いは1〜2コーナー側にある。
		// それ以外は、内回りは3〜4コーナーを手前で回って、直線に遅れて入る。
		const shift12 = inner.straight === outer.straight ? (outer.lap - inner.lap) / 2 : 0;
		turf.push({ cx1: -inner.straight, cx2: PAST_GOAL - shift12, r });
	}

	// ダートは芝の内側に収まる大きさまで縮める（公表値の一周距離から出した半径は、
	// 帯の幅を取ると芝に重なる場がある）。
	const dirtR = Math.min(
		(spec.dirt.lap - 2 * (spec.dirt.straight + PAST_GOAL)) / (2 * Math.PI),
		r - (TURF_WIDTH + DIRT_WIDTH) / 2 - GAP
	);
	// 1〜2コーナー側は、いちばん手前で回る芝のコース（中山の内回り）に合わせる。
	const dirt: Oval = {
		cx1: -spec.dirt.straight,
		cx2: Math.min(...turf.map((o) => o.cx2)),
		r: dirtR
	};

	const straight =
		spec.straightCourse !== undefined
			? { x1: -spec.straightCourse, x2: 0, y: r + TURF_WIDTH + GAP }
			: null;

	const xs = turf.flatMap((o) => [o.cx1 - o.r, o.cx2 + o.r]);
	if (straight) xs.push(straight.x1);
	const half = TURF_WIDTH / 2;
	const arrowY = -r - half - ARROW_GAP;
	const goalY1 = dirtR - DIRT_WIDTH / 2 - 6;
	const goalY2 = (straight ? straight.y : r) + half + 16;

	const x = Math.min(...xs) - half - PAD;
	const y = arrowY - 12 - PAD;
	return {
		turf,
		dirt,
		straight,
		box: { x, y, w: Math.max(...xs) + half + PAD - x, h: goalY2 + 10 + PAD - y },
		arrowY,
		goalY1,
		goalY2
	};
}

/** `<img>` の width / height（px）。読み込み前に場所を取っておくため。 */
export function courseMapSize(spec: CourseSpec): { width: number; height: number } {
	const { box } = layout(spec);
	return { width: Math.round(box.w * PX_PER_M), height: Math.round(box.h * PX_PER_M) };
}

const n = (v: number) => String(Math.round(v * 10) / 10);

function ovalPath({ cx1, cx2, r }: Oval): string {
	return [
		`M${n(cx1)} ${n(r)}`,
		`L${n(cx2)} ${n(r)}`,
		`A${n(r)} ${n(r)} 0 0 0 ${n(cx2)} ${n(-r)}`,
		`L${n(cx1)} ${n(-r)}`,
		`A${n(r)} ${n(r)} 0 0 0 ${n(cx1)} ${n(r)}Z`
	].join('');
}

/** コース図1枚の SVG。`scripts/course-maps.ts` がファイルに書き出す。 */
export function courseMapSvg(spec: CourseSpec, variant: CourseMapVariant): string {
	const l = layout(spec);
	const { width, height } = courseMapSize(spec);

	const turfColor = variant === 'turf' ? COLOR.turf : COLOR.inactive;
	const dirtColor = variant === 'dirt' ? COLOR.dirt : COLOR.inactive;
	const band = (d: string, color: string, w: number) =>
		`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;

	const tracks: { svg: string; active: boolean }[] = [
		...l.turf.map((o) => ({
			svg: band(ovalPath(o), turfColor, TURF_WIDTH),
			active: variant === 'turf'
		})),
		{ svg: band(ovalPath(l.dirt), dirtColor, DIRT_WIDTH), active: variant === 'dirt' }
	];
	if (l.straight) {
		const s = l.straight;
		tracks.push({
			svg: band(
				`M${n(s.x1)} ${n(s.y)}L${n(s.x2 + PAST_GOAL)} ${n(s.y)}`,
				variant === 'straight' ? COLOR.turf : COLOR.inactive,
				TURF_WIDTH
			),
			active: variant === 'straight'
		});
	}
	// 薄く描くコースを先に置き、強く描くコースが上に重なるようにする。
	tracks.sort((a, b) => Number(a.active) - Number(b.active));

	// 向正面の上に、走る向きの矢印。左回りならバックストレッチは右から左へ走る。
	const outer = l.turf[0];
	const mid = (outer.cx1 + outer.cx2) / 2;
	const arrow =
		`<path d="M${n(mid + 90)} ${n(l.arrowY)}H${n(mid - 90)}M${n(mid - 60)} ${n(l.arrowY - 18)}` +
		`L${n(mid - 90)} ${n(l.arrowY)}L${n(mid - 60)} ${n(l.arrowY + 18)}" fill="none" ` +
		`stroke="${COLOR.arrow}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;

	// ゴール板。コースを横切る線と、その外側の旗。
	const goal =
		`<path d="M0 ${n(l.goalY1)}V${n(l.goalY2)}" stroke="${COLOR.mark}" stroke-width="6"/>` +
		`<path d="M0 ${n(l.goalY2)}l26 -9l-26 -9Z" fill="${COLOR.mark}"/>`;

	const body = [...tracks.map((t) => t.svg), arrow, goal].join('');
	const flip = spec.direction === '右' ? ' transform="scale(-1 1)"' : '';
	const { box } = l;
	// 右回りは左右を反転するので、viewBox も反転した側に取る。
	const vx = spec.direction === '右' ? -(box.x + box.w) : box.x;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="${n(vx)} ${n(box.y)} ${n(box.w)} ${n(box.h)}">` +
		`<g${flip}>${body}</g></svg>\n`
	);
}

/** 書き出すコース図の一覧（ファイル名 → 中身）。 */
export function allCourseMaps(): Map<string, string> {
	const files = new Map<string, string>();
	for (const spec of Object.values(COURSE_SPECS)) {
		const variants: CourseMapVariant[] = ['turf', 'dirt'];
		if (spec.straightCourse !== undefined) variants.push('straight');
		for (const v of variants) files.set(`${spec.slug}-${v}.svg`, courseMapSvg(spec, v));
	}
	return files;
}
