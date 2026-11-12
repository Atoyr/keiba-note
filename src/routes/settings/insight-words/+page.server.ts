import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { INSIGHT_WORDS_LIMIT, insightWordSchema } from '#lib/schemas/insight.ts';
import {
	addInsightWord,
	addInsightWords,
	listInsightWords,
	removeInsightWord
} from '#lib/server/services/insights.ts';
import { DEFAULT_INSIGHT_WORDS } from '#lib/utils/insight-words.ts';
import { ctx } from '#lib/server/util.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * クイック入力の言葉（押すと、その馬のふりかえりメモの本文に入る自分の言葉）。全レース共通で、本人だけのもの。
 * 消しても、メモに入れた文は消えない（言葉は本文へ文字列のコピーとして入る）。
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { db, user } = ctx(locals);
	return { words: await listInsightWords(db, user.id), limit: INSIGHT_WORDS_LIMIT };
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const { db, user } = ctx(locals);
		const form = await request.formData();
		const raw = form.get('word');
		// おすすめのボタンから送ったときは、失敗の文をおすすめの節に出す（上の「新しい言葉」の欄に入力を入れない）。
		const fromDefaults = form.get('source') === 'defaults';
		const failed = (status: number, message: string, word: string) =>
			fail(status, fromDefaults ? { message, source: 'defaults' as const } : { message, word });
		const parsed = v.safeParse(insightWordSchema, typeof raw === 'string' ? raw : '');
		if (!parsed.success) {
			return failed(
				400,
				parsed.issues[0]?.message ?? '言葉を確認してください',
				typeof raw === 'string' ? raw : ''
			);
		}
		try {
			const result = await addInsightWord(db, user.id, parsed.output);
			if (!result.ok) {
				return result.reason === 'duplicate'
					? failed(409, 'その言葉はすでに登録されています', parsed.output)
					: failed(
							400,
							`登録できる言葉は${INSIGHT_WORDS_LIMIT}個までです。使わない言葉を削除してから足してください`,
							parsed.output
						);
			}
		} catch {
			// D1 の失敗は createDb の observer が記録する。入力を残して再試行できるようにする。
			return failed(
				503,
				'言葉の登録を確認できませんでした。時間をおいてもう一度登録してください。',
				parsed.output
			);
		}
		return { added: parsed.output };
	},

	/** おすすめの言葉をまとめて登録する。入力は無い（中身はコードの定数）。 */
	addDefaults: async ({ locals }) => {
		const { db, user } = ctx(locals);
		try {
			const { added, limited } = await addInsightWords(db, user.id, [...DEFAULT_INSIGHT_WORDS]);
			if (added.length === 0 && limited) {
				return fail(400, {
					message: `登録できる言葉は${INSIGHT_WORDS_LIMIT}個までです。使わない言葉を削除してから足してください`,
					source: 'defaults' as const
				});
			}
			return { addedDefaults: added, limited };
		} catch {
			return fail(503, {
				message: 'おすすめの言葉の登録を確認できませんでした。時間をおいてもう一度試してください。',
				source: 'defaults' as const
			});
		}
	},

	remove: async ({ locals, request }) => {
		const { db, user } = ctx(locals);
		const form = await request.formData();
		const raw = form.get('word');
		const parsed = v.safeParse(insightWordSchema, typeof raw === 'string' ? raw : '');
		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '言葉を確認してください' });
		}
		try {
			await removeInsightWord(db, user.id, parsed.output);
		} catch {
			return fail(503, {
				message: '言葉の削除を確認できませんでした。時間をおいてもう一度削除してください。'
			});
		}
		return { removed: parsed.output };
	}
};
