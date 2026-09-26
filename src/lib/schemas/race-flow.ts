import * as v from 'valibot';

/**
 * 展開の予想。レースの見立て（`race_preview`）に付く。
 *
 * スタート・4コーナー・ゴール前の3つの局面で、**どの馬がどこにいるか**を
 * 盤面（前後 × 内外のマス目）に置いて残す。文字の隊列記法（`⑤-③⑦-⑪`）ではなく
 * 盤面にしたのは、書いたあとに「どこに何を置いたか」が一目で分かるようにするため。
 *
 * 馬は**馬番ではなく出走馬の id で持つ。** 予想は枠順が決まる前に書くことが多く、
 * そのときは馬番が無い。枠順が入れば、置いた馬に馬番が付いて見えるようになる。
 */

/** 局面。並びは画面のタブの並び。 */
export const FLOW_PHASES = ['start', 'corner4', 'finish'] as const;
export type FlowPhase = (typeof FLOW_PHASES)[number];

export const FLOW_PHASE_LABEL: Record<FlowPhase, string> = {
	start: 'スタート',
	corner4: '4コーナー',
	finish: 'ゴール前'
};

/** 閉じているときの1行で使う短い名前。 */
export const FLOW_PHASE_SHORT: Record<FlowPhase, string> = {
	start: 'スタート',
	corner4: '4角',
	finish: 'ゴール前'
};

export const PACES = ['スロー', 'ミドル', 'ハイ'] as const;
export type Pace = (typeof PACES)[number];

/**
 * 盤面の前後のマス数。0 が先頭。
 *
 * 18頭が縦に長く伸びても置ける数で、390px 幅に 24px のコマが収まる数にした。
 */
export const FLOW_COLS = 10;

/** 盤面の内外の段。0 が内ラチ沿い。ゴール前で外に広がるのを書けるよう4段。 */
export const FLOW_LANES = ['内', '中', '外', '大外'] as const;

/** 一言メモの上限。1行で書く欄なので短く切る。 */
export const FLOW_MEMO_MAX = 200;

export type FlowSpot = { entryId: string; x: number; y: number };
export type FlowPhaseNote = { spots: FlowSpot[]; memo: string };
export type RaceFlow = { pace: Pace | null } & Record<FlowPhase, FlowPhaseNote>;

export const emptyFlowPhase = (): FlowPhaseNote => ({ spots: [], memo: '' });

export const emptyFlow = (): RaceFlow => ({
	pace: null,
	start: emptyFlowPhase(),
	corner4: emptyFlowPhase(),
	finish: emptyFlowPhase()
});

export const isEmptyFlow = (flow: RaceFlow | null | undefined): boolean =>
	!flow || (flow.pace === null && FLOW_PHASES.every((p) => isEmptyPhase(flow[p])));

export const isEmptyPhase = (phase: FlowPhaseNote): boolean =>
	phase.spots.length === 0 && phase.memo === '';

/**
 * 並びを揃える。前から後ろ、同じ列は内から外。
 *
 * 置いた順で持つと、同じ盤面でも保存のたびに JSON が変わって「未保存」に見える
 * （札の `tagsSchema` が NOTE_TAGS の順に揃えるのと同じ理由）。
 */
export const sortSpots = (spots: FlowSpot[]): FlowSpot[] =>
	[...spots].sort((a, b) => a.x - b.x || a.y - b.y);

/**
 * 1局面の置き場。フォームでは hidden の欄に JSON で入る。
 *
 * 画面が作る値なので、形が違うのは手で書き換えたときだけ。ここで弾いて 400 にする。
 */
const spotSchema = v.object({
	entryId: v.pipe(v.string(), v.minLength(1)),
	x: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(FLOW_COLS - 1)),
	y: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(FLOW_LANES.length - 1))
});

const spotsFieldSchema = v.pipe(
	v.optional(v.string(), ''),
	v.rawTransform(({ dataset, addIssue, NEVER }) => {
		if (dataset.value.trim() === '') return [];
		try {
			return JSON.parse(dataset.value) as unknown;
		} catch {
			addIssue({ message: '展開の隊列を読み取れませんでした' });
			return NEVER;
		}
	}),
	v.array(spotSchema, '展開の隊列を読み取れませんでした'),
	// 1頭は1か所、1マスには1頭。重なっていたら先に来たほうを残す。
	v.transform((spots) => {
		const horses = new Set<string>();
		const cells = new Set<string>();
		const kept: FlowSpot[] = [];
		for (const s of spots) {
			const cell = `${s.x}:${s.y}`;
			if (horses.has(s.entryId) || cells.has(cell)) continue;
			horses.add(s.entryId);
			cells.add(cell);
			kept.push({ entryId: s.entryId, x: s.x, y: s.y });
		}
		return sortSpots(kept);
	})
);

const phaseFieldSchema = v.object({
	spots: spotsFieldSchema,
	memo: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.maxLength(FLOW_MEMO_MAX, `展開のメモは${FLOW_MEMO_MAX}文字までです`)
	)
});

/**
 * 予想画面のフォームから来る展開。すべて空なら null（＝書いていない）。
 *
 * ペースはラジオ（`racePace`）、一言メモは素の入力欄（`flowMemo.<局面>`）、
 * 隊列は hidden の JSON（`flowSpots.<局面>`）で来る。ペースとメモを JSON に
 * まとめなかったのは、素の欄なら下書き（`DraftKeeper`）が何もしなくても拾えるため。
 */
export const raceFlowFormSchema = v.pipe(
	v.object({
		pace: v.pipe(
			v.optional(v.string(), ''),
			v.transform((s): Pace | null =>
				(PACES as readonly string[]).includes(s) ? (s as Pace) : null
			)
		),
		start: phaseFieldSchema,
		corner4: phaseFieldSchema,
		finish: phaseFieldSchema
	}),
	v.transform((flow): RaceFlow | null => (isEmptyFlow(flow) ? null : flow))
);

export type RaceFlowFormInput = v.InferInput<typeof raceFlowFormSchema>;

/**
 * このレースの出走馬でない id を落とす。**出走馬の構成は DB を正とする**
 * （フォームの id を鵜呑みにすると、他のレースの馬を盤面に置けてしまう）。
 * 取り下げで出走馬から消えた馬も、読むときにここで落ちる。
 */
export function restrictFlowTo(
	flow: RaceFlow | null,
	entryIds: ReadonlySet<string>
): RaceFlow | null {
	if (!flow) return null;
	const out: RaceFlow = { ...flow };
	for (const p of FLOW_PHASES) {
		out[p] = { ...flow[p], spots: flow[p].spots.filter((s) => entryIds.has(s.entryId)) };
	}
	return isEmptyFlow(out) ? null : out;
}
