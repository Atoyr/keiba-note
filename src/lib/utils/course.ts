/**
 * JRA の競馬場のコースの寸法と、コース図（`src/lib/assets/courses/*.svg`）の描き方。
 *
 * 数値は JRA の「コース紹介」（https://www.jra.go.jp/facilities/race/<場>/course/）の
 * Aコースの値（2026-09-24 に確認）。コース図はここから `pnpm run course-maps` で書き出す。
 * 図は形と大きさの見当をつけるための模式図で、実物のコースの形はなぞっていない
 * （JRA のコース図は著作物なので写さない）。
 */
import { elevationProfile, type ElevationProfile } from './course-elevation.ts';

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
	/**
	 * 向正面をまっすぐ延ばした引き込み線。`exit` は2コーナーの出口（向正面の始まり）がゴールから何 m か
	 * （コースを逆にたどって）、`distances` はそこから発走する距離。
	 * 図は2コーナーの出口がこの位置に来るよう、2コーナーを外へふくらませる。
	 * 内回りがある場（芝が2本）とは組み合わせない。
	 */
	backstretchChute?: { exit: number; distances: number[] };
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
	/**
	 * 芝の内回り・外回りそれぞれで行う距離。JRA の「発走距離」の表を元にし、
	 * 両方に載っている距離のうち、実際にはほぼ一方で行うもの（京都2000m・阪神1400m は内回り）は
	 * そちらだけに置く。残りの両方にある距離（京都1400・1600m、新潟1400・2000m）と、
	 * 中山・阪神の3200m（外回りから内回りへ回る）は、どちらか決められないので両方を強く描く。
	 */
	loopDistances?: Record<'内回り' | '外回り', number[]>;
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
		straightCourse: 1000,
		loopDistances: {
			内回り: [1200, 1400, 2000, 2200, 2400],
			外回り: [1400, 1600, 1800, 2000, 3000, 3200]
		}
	},
	東京: {
		slug: 'tokyo',
		direction: '左',
		turf: [
			{
				name: null,
				lap: 2083.1,
				straight: 525.9,
				rise: 2.7,
				// 1600m は向正面の引き込み線から出る。JRA は2コーナーの出口の位置を公表していないので、
				// 見当の値を置く。1400m は向正面から・1600m は引き込み線から出るので、その間に置く。
				// 引き込み線に 100m 以上入らないと、図で2コーナーの帯と重なって見分けられない
				// （陸上トラック形だと出口がゴールから 1567m で、1600m は 33m しか入らない）。
				backstretchChute: { exit: 1420, distances: [1600] }
			}
		],
		dirt: { name: null, lap: 1899, straight: 501.6, rise: 2.5 }
	},
	中山: {
		slug: 'nakayama',
		direction: '右',
		turf: [
			{ name: '外回り', lap: 1839.7, straight: 310, rise: 5.3 },
			{ name: '内回り', lap: 1667.1, straight: 310, rise: 5.3 }
		],
		dirt: { name: null, lap: 1493, straight: 308, rise: 4.5 },
		loopDistances: {
			内回り: [1800, 2000, 2500, 3200, 3600],
			外回り: [1200, 1600, 2200, 2600, 3200, 4000]
		}
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
		dirt: { name: null, lap: 1607.6, straight: 329.1, rise: 3 },
		loopDistances: {
			内回り: [1100, 1200, 1400, 1600, 2000],
			// 2000m は JRA の表では外回りにもあるが、実際はほぼ内回り（秋華賞など）。
			外回り: [1400, 1600, 1800, 2200, 2400, 3000, 3200]
		}
	},
	阪神: {
		slug: 'hanshin',
		direction: '右',
		turf: [
			{ name: '外回り', lap: 2089, straight: 473.6, rise: 2.4 },
			{ name: '内回り', lap: 1689, straight: 356.5, rise: 1.9 }
		],
		dirt: { name: null, lap: 1517.6, straight: 352.7, rise: 1.6 },
		loopDistances: {
			内回り: [1200, 1400, 2000, 2200, 3000, 3200],
			// 1400m は JRA の表では外回りにもあるが、実際はほぼ内回り（阪神C など）。
			外回り: [1600, 1800, 2400, 2600, 3200]
		}
	},
	小倉: {
		slug: 'kokura',
		direction: '右',
		turf: [{ name: null, lap: 1615.1, straight: 293, rise: 3 }],
		dirt: { name: null, lap: 1445.4, straight: 291.3, rise: 2.9 }
	}
};

/** どのコースを強く描くか。 */
export type CourseMapVariant = 'turf' | 'turf-inner' | 'turf-outer' | 'dirt' | 'straight';

const LOOP_VARIANT = { 内回り: 'turf-inner', 外回り: 'turf-outer' } as const;

/** 距離から内回りか外回りかを決める。決められなければ null。 */
export function turfLoop(spec: CourseSpec, distance: number | null): '内回り' | '外回り' | null {
	if (!spec.loopDistances || distance === null) return null;
	const hits = (['内回り', '外回り'] as const).filter((name) =>
		spec.loopDistances![name].includes(distance)
	);
	return hits.length === 1 ? hits[0] : null;
}

export type CourseMapSource = {
	course: string;
	surface: string | null;
	distance: number | null;
	direction: string | null;
};

/**
 * スタートからゴールまでの道すじ。図（SVG ファイル）の上に、同じ viewBox の SVG で重ねて描く。
 * 距離ごとに図のファイルを作らないのは、場×馬場×距離の表を持たずに、どの距離でも線を出すため。
 */
export type CourseRoute = {
	/** 同じ場の SVG ファイルと同じ viewBox。 */
	viewBox: string;
	/** 右回りの図は左右を反転して描く。`d` と `start` は反転前の座標なので、重ねるときに反転する。 */
	flip: boolean;
	/** 線の path。スタートからゴールへ。 */
	d: string;
	/** スタートの位置。 */
	start: Point;
	/**
	 * 図の上の線の長さ（m）。周回コースは、描いた周が公表の一周距離と違うことがあるので、
	 * レースの距離そのものではなく「公表の一周に対する割合」を描いた周に当てはめた長さになる
	 * （直線コースと、東京芝の引き込み線から出る距離は、レースの距離と同じ）。
	 */
	length: number;
};

export type CourseMap = {
	/** `src/lib/assets/courses/` のファイル名（拡張子なし）。 */
	file: string;
	width: number;
	height: number;
	alt: string;
	/** 図の下に並べる「左回り」「直線 525.9m」など。 */
	facts: string[];
	/** スタートからゴールまでの高低断面。数値の無いコース・障害・距離の無いレースは null。 */
	profile: ElevationProfile | null;
	/** スタートからゴールまでの道すじ。図に重ねて黄色で描く。出せないレースは null。 */
	route: CourseRoute | null;
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
 * 直線コース（新潟の芝1000m）を走るレースか。回りが空でも距離で決まる。
 * コース図と展開の盤面の向き（`flowLeadsRight`）で同じ判定を使う。
 */
export function isStraightCourse(
	spec: CourseSpec,
	race: Pick<CourseMapSource, 'surface' | 'distance' | 'direction'>
): boolean {
	return (
		spec.straightCourse !== undefined &&
		race.surface === '芝' &&
		(race.direction === '直線' || race.distance === spec.straightCourse)
	);
}

/**
 * レースに合うコース図と、その下に出す寸法。JRA の10場以外（地方・海外）と、
 * 馬場が決まっていないレースは null（どの図を出しても当てずっぽうになる）。
 */
export function courseMap(race: CourseMapSource): CourseMap | null {
	const spec = COURSE_SPECS[race.course];
	if (!spec || !race.surface) return null;

	const straightCourse = isStraightCourse(spec, race);

	// 障害は専用のコースを走るので、芝の図を出して寸法は出さない。
	const loop = race.surface === '芝' && !straightCourse ? turfLoop(spec, race.distance) : null;
	const variant: CourseMapVariant = straightCourse
		? 'straight'
		: race.surface === 'ダート'
			? 'dirt'
			: loop
				? LOOP_VARIANT[loop]
				: 'turf';
	const { width, height } = courseMapSize(spec);

	let facts: string[];
	// 高低断面に描く最後の直線。内回り・外回りが決まらなければ高低断面も出ないので要らない。
	let straight: number | null = null;
	if (straightCourse) {
		facts = [`直線コース ${m(spec.straightCourse!)}`];
	} else if (race.surface === '障害') {
		facts = [`${spec.direction}回り`];
	} else {
		const loops =
			variant === 'dirt' ? [spec.dirt] : spec.turf.filter((l) => !loop || l.name === loop);
		facts = [
			loop ? `${spec.direction}回り・${loop}` : `${spec.direction}回り`,
			`直線 ${perLoop(loops, (l) => l.straight)}`,
			`高低差 ${perLoop(loops, (l) => l.rise)}`
		];
		straight = loops[0].straight;
	}

	const surfaceLabel = straightCourse ? '芝・直線' : loop ? `芝・${loop}` : race.surface;
	const file = `${spec.slug}-${variant}`;
	return {
		file,
		width,
		height,
		alt: `${race.course}競馬場のコース図（${surfaceLabel}）`,
		facts,
		// 障害は専用のコース（襷・坂路）を走るので、平地の道すじも高低断面も当てはまらない。
		route: race.surface === '障害' ? null : courseRoute(spec, variant, race.distance),
		profile:
			race.surface === '障害'
				? null
				: elevationProfile(file, race.distance, {
						straight: straightCourse ? null : straight,
						// スタンドから見て、左回りと直線コースは左から右へ走ってくる。
						goalRight: straightCourse || spec.direction === '左',
						surface: race.surface === 'ダート' ? 'ダート' : '芝'
					})
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
/** 「ゴール」の文字の大きさ（m）。PX_PER_M を掛けると約 11px。 */
const LABEL_SIZE = 36;
const PAD = 12;
/** 引き込み線を、いちばん遠い発走地点より先へ余らせる長さ（m）。 */
const CHUTE_TAIL = 20;

const COLOR = {
	turf: '#3d7a45',
	dirt: '#94663a',
	inactive: '#dcdcdc',
	mark: '#262626',
	arrow: '#525252',
	route: '#facc15'
} as const;

/**
 * スタートからゴールまでの道すじの線と、スタートの丸。単位は図と同じメートル（viewBox の座標）。
 * 画面（`CourseMap`）が図の上に重ねる。
 */
export const ROUTE_STYLE = {
	color: COLOR.route,
	width: 8,
	startRadius: 12,
	startStroke: COLOR.mark,
	startStrokeWidth: 4
} as const;

/** 高低断面のグラフを、コース図と同じ馬場の色で塗るため。 */
export const SURFACE_COLOR = { 芝: COLOR.turf, ダート: COLOR.dirt } as const;

/**
 * 角の中心が cx1・cx2、半径 r の陸上トラック形。y は下向き、ホームストレッチが下。
 * `bulge` があれば、2コーナーの途中から外へふくらみ、向正面を斜めに下って
 * 3〜4コーナーを大きく回り、4コーナーの出口で直線に戻る（中山の外回りの「おむすび形」）。
 */
type Oval = { cx1: number; cx2: number; r: number; bulge?: number };

/**
 * ふくらんだ外回りの形。2コーナーは中心 (cx2 - bulge, 0)・半径 r + bulge の円、
 * 3〜4コーナーは直線の入口 (cx1, r) で接する半径 r + bulge × BULGE_34 の円で、
 * 向正面はその2つの円の外側の共通接線。2コーナーのほうを大きくふくらませて、向正面を斜めにする。
 */
const BULGE_34 = 0.3;

/** 2コーナー側の円と3〜4コーナー側の円、向正面の両端（y は下向き）。 */
function bulgeGeometry({ cx1, cx2, r, bulge = 0 }: Oval) {
	const r2 = r + bulge;
	const r34 = r + bulge * BULGE_34;
	// ここだけ y を上向きにして角度を数える（反時計回りが正）。
	const c2 = { x: cx2 - bulge, y: 0 };
	const c34 = { x: cx1, y: -r + r34 };
	const dx = c34.x - c2.x;
	const dy = c34.y - c2.y;
	const dist = Math.hypot(dx, dy);
	// 2つの円を同じ向きに回るときの外側の接線。接点の法線の角度が phi。
	const phi = Math.atan2(dy, dx) - Math.acos((r2 - r34) / dist);
	const at = (c: { x: number; y: number }, radius: number) => ({
		x: c.x + radius * Math.cos(phi),
		y: -(c.y + radius * Math.sin(phi))
	});
	return {
		r2,
		r34,
		phi,
		from: at(c2, r2),
		to: at(c34, r34),
		back: Math.sqrt(dist ** 2 - (r2 - r34) ** 2),
		// 図のいちばん上（y は下向き）。2コーナーの頂上か、3〜4コーナーの頂上の高いほう。
		top: -Math.max(
			phi >= Math.PI / 2 ? r2 : r2 * Math.sin(phi),
			c34.y + (phi <= Math.PI / 2 ? r34 : r34 * Math.sin(phi))
		)
	};
}

/** 1周の長さ（m）。 */
function ovalLength(o: Oval): number {
	const straight = o.cx2 - o.cx1;
	if (!o.bulge) return 2 * straight + 2 * Math.PI * o.r;
	const g = bulgeGeometry(o);
	return (
		straight + (Math.PI / 2) * o.r + g.r2 * g.phi + g.back + g.r34 * ((3 * Math.PI) / 2 - g.phi)
	);
}

/** 一周距離が lap になるふくらみ。長さはふくらみとともに増えるので、二分法で探す。 */
function solveBulge(base: Oval, lap: number): number {
	let lo = 0;
	let hi = base.r * 4;
	if (ovalLength({ ...base, bulge: hi }) < lap) throw new Error('一周距離に届くふくらみが無い');
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (ovalLength({ ...base, bulge: mid }) < lap) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** 図の上下左右の端（y は下向き）。 */
function ovalBounds(o: Oval): { left: number; right: number; top: number } {
	if (!o.bulge) return { left: o.cx1 - o.r, right: o.cx2 + o.r, top: -o.r };
	const g = bulgeGeometry(o);
	return { left: o.cx1 - g.r34, right: o.cx2 + o.r, top: g.top };
}

type Point = { x: number; y: number };

type Layout = {
	turf: Oval[];
	dirt: Oval;
	/** 直線コースの始点と終点の x、y。 */
	straight: { x1: number; x2: number; y: number } | null;
	/** 向正面の引き込み線（東京の芝）。from は2コーナーの出口、exit はそこがゴールから何 m か。 */
	chute: { from: Point; to: Point; exit: number } | null;
	box: { x: number; y: number; w: number; h: number };
	arrowY: number;
	goalY1: number;
	goalY2: number;
};

/**
 * 引き込み線のある外回り。2コーナーの出口がゴールから `exit` に来るよう、r と bulge を決める。
 * 一周距離は保つ。r が大きいほど出口は遠く（陸上トラック形の r で lap/2 + straight）なるので、二分法で探す。
 */
function chuteOval(
	loop: CourseLoop,
	chute: NonNullable<CourseLoop['backstretchChute']>
): { r: number; oval: Oval; exit: number } {
	const symmetric = (loop.lap - 2 * (loop.straight + PAST_GOAL)) / (2 * Math.PI);
	const at = (r: number) => {
		const base: Oval = { cx1: -loop.straight, cx2: PAST_GOAL, r };
		const oval: Oval = { ...base, bulge: solveBulge(base, loop.lap) };
		const g = bulgeGeometry(oval);
		return { r, oval, exit: loop.lap - (PAST_GOAL + (Math.PI * r) / 2 + g.r2 * g.phi) };
	};
	let lo = symmetric / 2;
	let hi = symmetric;
	if (chute.exit < at(lo).exit || chute.exit > at(hi).exit) {
		throw new Error(`引き込み線の位置 ${chute.exit}m に合う形が無い`);
	}
	for (let i = 0; i < 60; i++) {
		const mid = (lo + hi) / 2;
		if (at(mid).exit < chute.exit) lo = mid;
		else hi = mid;
	}
	return at((lo + hi) / 2);
}

/**
 * 左回りで組み立てる（ホームストレッチを左から右へ走り、ゴールは x = 0）。
 * 右回りは描くときに左右を反転する。
 */
function buildLayout(spec: CourseSpec): Layout {
	const [outer, ...inners] = spec.turf;
	// 直線が同じ長さ（中山）なら、外回りは2コーナーから外へ分かれて3〜4コーナーを大きく回り、
	// 4コーナーの出口で内回りに戻る。大きさは内回りで決め、外回りはその外へふくらませる。
	// それ以外（新潟・京都・阪神）は、内回りが3〜4コーナーを手前で回って、直線に遅れて入る。
	const bulged = inners.length > 0 && inners[0].straight === outer.straight;
	let r: number;
	let outerOval: Oval;
	let chuteExit: number | null = null;
	if (outer.backstretchChute) {
		if (inners.length > 0) throw new Error('引き込み線は内回りのある場と組み合わせられない');
		if (Math.max(...outer.backstretchChute.distances) <= outer.backstretchChute.exit) {
			throw new Error('引き込み線から出る距離は、出口より長くなければならない');
		}
		({ r, oval: outerOval, exit: chuteExit } = chuteOval(outer, outer.backstretchChute));
	} else {
		const base = bulged ? inners[0] : outer;
		r = (base.lap - 2 * (base.straight + PAST_GOAL)) / (2 * Math.PI);
		outerOval = { cx1: -outer.straight, cx2: PAST_GOAL, r };
		if (bulged) outerOval.bulge = solveBulge(outerOval, outer.lap);
	}
	const turf: Oval[] = [outerOval];
	for (const inner of inners) turf.push({ cx1: -inner.straight, cx2: PAST_GOAL, r });

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
	// 芝が1本でふくらんでいれば（東京）、ダートも同じふくらみで芝の内側に沿わせる。
	if (turf.length === 1 && outerOval.bulge) dirt.bulge = outerOval.bulge;

	// 向正面をまっすぐ延ばした引き込み線。2コーナーの出口から、走る向きと逆へ延ばす。
	let chute: Layout['chute'] = null;
	if (chuteExit !== null) {
		const g = bulgeGeometry(outerOval);
		const len = Math.hypot(g.from.x - g.to.x, g.from.y - g.to.y);
		const extra = Math.max(...outer.backstretchChute!.distances) - chuteExit + CHUTE_TAIL;
		chute = {
			from: g.from,
			to: {
				x: g.from.x + ((g.from.x - g.to.x) / len) * extra,
				y: g.from.y + ((g.from.y - g.to.y) / len) * extra
			},
			exit: chuteExit
		};
	}

	const straight =
		spec.straightCourse !== undefined
			? { x1: -spec.straightCourse, x2: 0, y: r + TURF_WIDTH + GAP }
			: null;

	const bounds = turf.map(ovalBounds);
	const xs = bounds.flatMap((b) => [b.left, b.right]);
	if (straight) xs.push(straight.x1);
	if (chute) xs.push(chute.to.x);
	const half = TURF_WIDTH / 2;
	const arrowY =
		Math.min(...bounds.map((b) => b.top), ...(chute ? [chute.to.y] : [])) - half - ARROW_GAP;
	const goalY1 = dirtR - DIRT_WIDTH / 2 - 6;
	const goalY2 = (straight ? straight.y : r) + half + 16;

	const x = Math.min(...xs) - half - PAD;
	const y = arrowY - 12 - PAD;
	return {
		turf,
		dirt,
		straight,
		chute,
		box: { x, y, w: Math.max(...xs) + half + PAD - x, h: goalY2 + LABEL_SIZE + 12 + PAD - y },
		arrowY,
		goalY1,
		goalY2
	};
}

const layouts = new WeakMap<CourseSpec, Layout>();

function layout(spec: CourseSpec): Layout {
	let l = layouts.get(spec);
	if (!l) layouts.set(spec, (l = buildLayout(spec)));
	return l;
}

/** `<img>` の width / height（px）。読み込み前に場所を取っておくため。 */
export function courseMapSize(spec: CourseSpec): { width: number; height: number } {
	const { box } = layout(spec);
	return { width: Math.round(box.w * PX_PER_M), height: Math.round(box.h * PX_PER_M) };
}

const n = (v: number) => String(Math.round(v * 10) / 10);
const pt = (p: Point) => `${n(p.x)} ${n(p.y)}`;

function ovalPath(o: Oval): string {
	const { cx1, cx2, r } = o;
	if (o.bulge) {
		const g = bulgeGeometry(o);
		// 3〜4コーナーの弧が半周を超えるなら大きいほうの弧。
		const large = (3 * Math.PI) / 2 - g.phi > Math.PI ? 1 : 0;
		return [
			`M${n(cx1)} ${n(r)}`,
			`L${n(cx2)} ${n(r)}`,
			`A${n(r)} ${n(r)} 0 0 0 ${n(cx2 + r)} 0`,
			`A${n(g.r2)} ${n(g.r2)} 0 0 0 ${n(g.from.x)} ${n(g.from.y)}`,
			`L${n(g.to.x)} ${n(g.to.y)}`,
			`A${n(g.r34)} ${n(g.r34)} 0 ${large} 0 ${n(cx1)} ${n(r)}Z`
		].join('');
	}
	return [
		`M${n(cx1)} ${n(r)}`,
		`L${n(cx2)} ${n(r)}`,
		`A${n(r)} ${n(r)} 0 0 0 ${n(cx2)} ${n(-r)}`,
		`L${n(cx1)} ${n(-r)}`,
		`A${n(r)} ${n(r)} 0 0 0 ${n(cx1)} ${n(r)}Z`
	].join('');
}

/** 図の viewBox。右回りは左右を反転して描くので、反転した側に取る。 */
function viewBoxOf(spec: CourseSpec, l: Layout): string {
	const { box } = l;
	const vx = spec.direction === '右' ? -(box.x + box.w) : box.x;
	return `${n(vx)} ${n(box.y)} ${n(box.w)} ${n(box.h)}`;
}

/** コース図1枚の SVG。`scripts/course-maps.ts` がファイルに書き出す。 */
export function courseMapSvg(spec: CourseSpec, variant: CourseMapVariant): string {
	const l = layout(spec);
	const { width, height } = courseMapSize(spec);

	// 内回り・外回りが決まっていれば、そのコースだけを強く描く。
	const loop = variant === 'turf-inner' ? '内回り' : variant === 'turf-outer' ? '外回り' : null;
	const turfActive = (name: CourseLoop['name']) =>
		variant === 'turf' || (loop !== null && name === loop);
	const dirtColor = variant === 'dirt' ? COLOR.dirt : COLOR.inactive;
	const band = (d: string, color: string, w: number) =>
		`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;

	const tracks: { svg: string; active: boolean }[] = [
		// layout の turf は spec.turf と同じ順（外回りが先）。
		...l.turf.map((o, i) => {
			const active = turfActive(spec.turf[i].name);
			// 引き込み線は外回り（先頭）の帯の続きとして、同じ色で描く。
			const chute = i === 0 && l.chute ? `M${pt(l.chute.from)}L${pt(l.chute.to)}` : '';
			return {
				svg: band(ovalPath(o) + chute, active ? COLOR.turf : COLOR.inactive, TURF_WIDTH),
				active
			};
		}),
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

	// ゴール板。コースを横切る線。旗だけでは走る向きの矢印と見分けにくいので、文字を添える。
	const goal = `<path d="M0 ${n(l.goalY1)}V${n(l.goalY2)}" stroke="${COLOR.mark}" stroke-width="6"/>`;
	// 文字は反転させない（右回りの図は左右を反転して描くので、グループの外に置く）。
	// ゴールは x = 0 なので、反転しても位置は変わらない。
	const label =
		`<text x="0" y="${n(l.goalY2 + LABEL_SIZE)}" font-size="${LABEL_SIZE}" ` +
		`text-anchor="middle" fill="${COLOR.mark}" font-family="sans-serif">ゴール</text>`;

	const body = [...tracks.map((t) => t.svg), arrow, goal].join('');
	const flip = spec.direction === '右' ? ' transform="scale(-1 1)"' : '';
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="${viewBoxOf(spec, l)}">` +
		`<g${flip}>${body}</g>${label}</svg>\n`
	);
}

// ---------------------------------------------------------------------------
// スタートからゴールまでの道すじ。
// ---------------------------------------------------------------------------

/** 走る向きに並べた道の1区間。円弧は、図の path と同じ向き（見た目で反時計回り）に進む。 */
type Seg =
	| { kind: 'line'; len: number; from: Point; to: Point }
	| { kind: 'arc'; len: number; c: Point; radius: number; a0: number };

const line = (from: Point, to: Point): Seg => ({
	kind: 'line',
	len: Math.hypot(to.x - from.x, to.y - from.y),
	from,
	to
});

/** 円弧。a0 は始点の角度（y 下向きの座標での atan2）で、進むほど角度は減る。 */
const arc = (c: Point, radius: number, a0: number, len: number): Seg => ({
	kind: 'arc',
	len,
	c,
	radius,
	a0
});

/** 周回コース1周を、ゴールから走る向きに並べた区間の列にする。 */
function lapSegments(o: Oval): Seg[] {
	const { cx1, cx2, r } = o;
	const goal = { x: 0, y: r };
	if (!o.bulge) {
		return [
			line(goal, { x: cx2, y: r }),
			arc({ x: cx2, y: 0 }, r, Math.PI / 2, Math.PI * r),
			line({ x: cx2, y: -r }, { x: cx1, y: -r }),
			arc({ x: cx1, y: 0 }, r, -Math.PI / 2, Math.PI * r),
			line({ x: cx1, y: r }, goal)
		];
	}
	const g = bulgeGeometry(o);
	return [
		line(goal, { x: cx2, y: r }),
		arc({ x: cx2, y: 0 }, r, Math.PI / 2, (Math.PI * r) / 2),
		arc({ x: cx2 - o.bulge, y: 0 }, g.r2, 0, g.r2 * g.phi),
		line(g.from, g.to),
		arc({ x: cx1, y: r - g.r34 }, g.r34, -g.phi, g.r34 * ((3 * Math.PI) / 2 - g.phi)),
		line({ x: cx1, y: r }, goal)
	];
}

function segPoint(seg: Seg, t: number): Point {
	if (seg.kind === 'line') {
		const k = seg.len === 0 ? 0 : t / seg.len;
		return {
			x: seg.from.x + (seg.to.x - seg.from.x) * k,
			y: seg.from.y + (seg.to.y - seg.from.y) * k
		};
	}
	const a = seg.a0 - t / seg.radius;
	return { x: seg.c.x + seg.radius * Math.cos(a), y: seg.c.y + seg.radius * Math.sin(a) };
}

/**
 * ゴールを 0 として周回コースを走る向きに延ばした位置のうち、[from, to] の区間の path のコマンド
 * （先頭は M）と、始点、実際に進んだ長さ。1周を超えるぶんは2周目以降として同じ区間を繰り返す。
 */
function walk(
	segs: Seg[],
	from: number,
	to: number
): { cmds: string[]; start: Point; length: number } {
	const lap = segs.reduce((sum, s) => sum + s.len, 0);
	const cmds: string[] = [];
	let start: Point = segPoint(segs[0], 0);
	let length = 0;
	let offset = Math.floor(Math.max(from, 0) / lap) * lap;
	for (let i = 0; offset < to; i = (i + 1) % segs.length) {
		const seg = segs[i];
		const t0 = Math.max(from - offset, 0);
		const t1 = Math.min(to - offset, seg.len);
		if (t1 - t0 > 1e-6) {
			if (cmds.length === 0) {
				start = segPoint(seg, t0);
				cmds.push(`M${pt(start)}`);
			}
			const end = pt(segPoint(seg, t1));
			cmds.push(
				seg.kind === 'line'
					? `L${end}`
					: `A${n(seg.radius)} ${n(seg.radius)} 0 ${(t1 - t0) / seg.radius > Math.PI ? 1 : 0} 0 ${end}`
			);
			length += t1 - t0;
		}
		offset += seg.len;
	}
	return { cmds, start, length };
}

/**
 * レースの距離で走る、スタートからゴールまでの道すじ。
 * 周回コースの部分は、描いた周と公表の一周距離（`CourseLoop.lap`）の長さが違っても、
 * スタートが一周に対して合う割合の位置に来るよう、距離に（描いた周 ÷ 公表の周）を掛けた長さをゴールから逆にたどる。
 * 描いた周が公表と違うのは、ダート（芝の内側に収めるため半径を縮める）と、
 * 外回りと同じ半径で描く内回りの芝。
 * 出せないとき（距離が分からない・内回り外回りが決まらない芝・直線コースを超える距離）は null。
 * 障害は専用のコースを走るので、呼ぶ側（`courseMap`）が除く。
 */
export function courseRoute(
	spec: CourseSpec,
	variant: CourseMapVariant,
	distance: number | null
): CourseRoute | null {
	if (!distance || distance <= 0) return null;
	const l = layout(spec);
	const base = { viewBox: viewBoxOf(spec, l), flip: spec.direction === '右' };

	if (variant === 'straight') {
		const s = l.straight;
		if (!s || distance > spec.straightCourse!) return null;
		const start = { x: -distance, y: s.y };
		return { ...base, d: `M${pt(start)}L${n(0)} ${n(s.y)}`, start, length: distance };
	}
	// 内回り・外回りが決まらない芝は、どちらを走るか分からない。
	if (variant === 'turf' && spec.turf.length > 1) return null;

	const oval = variant === 'dirt' ? l.dirt : l.turf[variant === 'turf-inner' ? 1 : 0];
	const segs = lapSegments(oval);
	const lap = segs.reduce((sum, s) => sum + s.len, 0);
	const published =
		variant === 'dirt' ? spec.dirt.lap : spec.turf[variant === 'turf-inner' ? 1 : 0].lap;

	// 引き込み線から出る距離は、線の上の (distance - exit) の点から2コーナーの出口まで直線で来て、
	// 出口からゴールまでは周回コース。引き込み線の上は m のまま置く。exit も、描いた周が公表の一周と
	// 合っている東京の芝で決めた値なので、描いた周の上の長さのまま使う（割合に直さない）。
	const chute = variant === 'turf' || variant === 'turf-outer' ? l.chute : null;
	if (chute && spec.turf[0].backstretchChute!.distances.includes(distance)) {
		const into = distance - chute.exit;
		const dx = chute.to.x - chute.from.x;
		const dy = chute.to.y - chute.from.y;
		const len = Math.hypot(dx, dy);
		const start = { x: chute.from.x + (dx / len) * into, y: chute.from.y + (dy / len) * into };
		const rest = walk(segs, lap - chute.exit, lap);
		return {
			...base,
			d: [`M${pt(start)}`, `L${pt(chute.from)}`, ...rest.cmds.slice(1)].join(''),
			start,
			length: into + rest.length
		};
	}

	const drawn = (distance * lap) / published;
	const end = Math.ceil(drawn / lap) * lap;
	const w = walk(segs, end - drawn, end);
	return { ...base, d: w.cmds.join(''), start: w.start, length: w.length };
}

/** 書き出すコース図の一覧（ファイル名 → 中身）。 */
export function allCourseMaps(): Map<string, string> {
	const files = new Map<string, string>();
	for (const spec of Object.values(COURSE_SPECS)) {
		const variants: CourseMapVariant[] = ['turf', 'dirt'];
		if (spec.straightCourse !== undefined) variants.push('straight');
		if (spec.loopDistances) variants.push('turf-inner', 'turf-outer');
		for (const v of variants) files.set(`${spec.slug}-${v}.svg`, courseMapSvg(spec, v));
	}
	return files;
}
