import { describe, expect, it } from 'vitest';
import { noteHeading, previewSaveLabel, raceReviewSaveLabel, runHeading } from './note';

const race = {
	course: '中山',
	raceNumber: 11,
	raceName: 'オールカマー',
	grade: 'G2',
	className: null,
	finishPosition: 1
};

describe('noteHeading', () => {
	it('ふりかえりのメモには着順を出す', () => {
		expect(noteHeading({ kind: 'entry', ...race })).toEqual({
			label: '中山11R オールカマー (G2) 1着',
			kindLabel: null
		});
	});

	// 書いた時点では着順が無い。あとから結果が入って「出走前に書いたのに1着」に見えるのを防ぐ。
	it('出走前メモには着順を出さない', () => {
		expect(noteHeading({ kind: 'preview', ...race })).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '出走前'
		});
	});

	// レース全体の見立ても開催前に書いたもの。同じ理由で着順を出さない。
	it('レースの見立てにも着順を出さない', () => {
		expect(noteHeading({ kind: 'race_preview', ...race })).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '見立て'
		});
	});

	// 同じレースに見立てとふりかえりの2行が並ぶので、札で見分けが付かないと困る。
	it('見立てとふりかえりのレースのメモは札で見分けられる', () => {
		expect(noteHeading({ kind: 'race_preview', ...race }).kindLabel).toBe('見立て');
		expect(noteHeading({ kind: 'race', ...race }).kindLabel).toBe(null);
	});

	it('格が無いレースはクラスを代わりに出す', () => {
		expect(noteHeading({ ...race, kind: 'entry', grade: null, className: '1勝クラス' }).label).toBe(
			'中山11R オールカマー (1勝クラス) 1着'
		);
	});
});

/**
 * メモの無い出走の見出し。タイムラインの骨になる行で、**日付の境界**が
 * そのまま「着順を出すか」を決める（未来のレースに着順は無い）。
 */
describe('runHeading', () => {
	it('終わったレースは着順まで出す', () => {
		expect(runHeading(race, false)).toEqual({
			label: '中山11R オールカマー (G2) 1着',
			kindLabel: '出走'
		});
	});

	it('これから走るレースは着順を出さない', () => {
		expect(runHeading({ ...race, finishPosition: null }, true)).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '出走予定'
		});
	});

	// 出馬表は開催前に入るので、結果が未入力のまま日付だけ過ぎた行がありうる。
	it('着順が未入力でも、日が過ぎていれば「出走」として出す', () => {
		expect(runHeading({ ...race, finishPosition: null }, false)).toEqual({
			label: '中山11R オールカマー (G2)',
			kindLabel: '出走'
		});
	});

	it('レース名も格も無ければ「レース」とだけ出す', () => {
		expect(runHeading({ course: null, raceNumber: null }, false).label).toBe('レース');
	});
});

/**
 * ふりかえり画面の保存ボタン。**出走馬の数だけが文言を決める。**
 * ここを取り違えると、入力欄が1つしか無い画面で「まとめて保存」と名乗ることになる。
 */
describe('raceReviewSaveLabel', () => {
	it('出走馬がいなければ「まとめて」と言わない', () => {
		// 入力欄はレースのメモ1つだけ。まとめる相手がいない。
		expect(raceReviewSaveLabel(0)).toBe('レースのメモを保存');
	});

	it('出走馬が1頭でも並んでいればまとめて保存', () => {
		// レースのメモ + 各馬のメモを1送信で保存する画面なので、
		// 1頭でも並んでいれば「まとめて」が実態に合う。
		expect(raceReviewSaveLabel(1)).toBe('まとめて保存');
		expect(raceReviewSaveLabel(18)).toBe('まとめて保存');
	});
});

/**
 * 予想画面の保存ボタン。理由は `raceReviewSaveLabel` と同じだが、
 * **0頭に当たるのはこちらのほうが多い**（出馬表が出る前の重賞）。
 */
describe('previewSaveLabel', () => {
	it('出走馬がいなければ、書けるのは見立てだけだとそのまま名乗る', () => {
		expect(previewSaveLabel(0)).toBe('レースの見立てを保存');
	});

	it('出走馬が並んでいれば出走前メモの保存', () => {
		expect(previewSaveLabel(1)).toBe('出走前メモを保存');
		expect(previewSaveLabel(18)).toBe('出走前メモを保存');
	});
});
