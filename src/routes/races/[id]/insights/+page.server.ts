import { error, fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { insightEntryIdSchema, insightMemoSchema, insightToggleSchema } from '$lib/schemas/insight';
import { getInsightTarget, setInsightMemo, setInsightWord } from '$lib/server/services/insights';
import { isUpcoming, todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import type { Actions } from './$types';

/**
 * レース直後の気づき（馬に付ける言葉と短いメモ）の保存。
 *
 * **`/races/[id]` には `default` action があり、名前付き action を足せない**（SvelteKit の制約）ので、
 * ルートを分けた。ここにも `default` だけ置く。`load` は無い（画面は JS が無いときの結果の表示だけ）。
 *
 * 画面は 1 操作 1 リクエストで、`fetch`（`x-sveltekit-action`）でも、JS が無いときの form POST でも同じ口を使う。
 * 入力は次のどちらか。
 * - `toggle`: JSON `{ entryId, word, on }`。言葉を付ける・外す
 * - `saveMemo`（出走馬の id）と `insightMemo.<entryId>`: 自由入力の気づきを置き換える
 *
 * 出走馬の構成は DB を正とする。フォームの id を鵜呑みにすると、別のレースの出走馬に書き込めてしまう。
 */
const SAVE_FAILED = '気づきの保存を確認できませんでした。時間をおいてもう一度試してください。';

export const actions: Actions = {
	default: async ({ locals, platform, params, request }) => {
		const { db, user } = ctx(locals, platform);
		const form = await request.formData();

		const toggle = form.get('toggle');
		const saveMemo = form.get('saveMemo');

		let entryId: string;
		/** 付けようとした言葉（付ける操作のときだけ）。応答に無ければ 1 頭の上限で付かなかった。 */
		let attached: string | null = null;
		let apply: (target: NonNullable<Awaited<ReturnType<typeof getInsightTarget>>>) => Promise<{
			words: string[];
			memo: string;
		}>;

		if (typeof toggle === 'string') {
			let json: unknown;
			try {
				json = JSON.parse(toggle);
			} catch {
				return fail(400, { message: '言葉の送り方が正しくありません' });
			}
			const parsed = v.safeParse(insightToggleSchema, json);
			if (!parsed.success) {
				return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
			}
			const { word, on } = parsed.output;
			entryId = parsed.output.entryId;
			if (on) attached = word;
			apply = (target) => setInsightWord(db, user.id, target, word, on);
		} else if (typeof saveMemo === 'string' && saveMemo !== '') {
			// 検証を通っていない id は、失敗の応答にも結果画面のリンクにも入れない。
			const id = v.safeParse(insightEntryIdSchema, saveMemo);
			if (!id.success) return fail(400, { message: id.issues[0].message });
			entryId = id.output;
			const parsed = v.safeParse(insightMemoSchema, form.get(`insightMemo.${entryId}`) ?? '');
			if (!parsed.success) {
				return fail(400, {
					message: parsed.issues[0]?.message ?? '入力を確認してください',
					entryId
				});
			}
			const memo = parsed.output;
			apply = (target) => setInsightMemo(db, user.id, target, memo);
		} else {
			return fail(400, { message: '保存する内容がありません' });
		}

		let target: Awaited<ReturnType<typeof getInsightTarget>>;
		try {
			target = await getInsightTarget(db, params.id, entryId);
		} catch {
			// 404・400 の error() は try の外（SvelteKit の例外を飲み込まない）。D1 の失敗だけここで受ける。
			return fail(503, { message: SAVE_FAILED, entryId });
		}
		// 無いレース・別のレースの出走馬は同じ 404（在るかどうかを漏らさない）。
		if (!target) error(404, '出走馬が見つかりません');

		// 開催前のレースには、直後の気づきを残せない（ふりかえりと同じ線引き）。
		if (isUpcoming(target.date, todayJst())) {
			error(400, 'まだ開催されていないレースに気づきは残せません');
		}

		try {
			const saved = await apply(target);
			// JS が無いときの結果の画面は、上限で付かなかったことを「保存しました」と言わずに伝える。
			return {
				entryId,
				words: saved.words,
				memo: saved.memo,
				limited: attached !== null && !saved.words.includes(attached)
			};
		} catch {
			// D1 の失敗は createDb の observer が記録する。操作は画面（端末）に残るので、案内して再試行してもらう。
			return fail(503, { message: SAVE_FAILED, entryId });
		}
	}
};
