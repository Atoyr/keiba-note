import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { INSIGHT_WORDS_LIMIT, insightWordSchema } from '$lib/schemas/insight';
import { addInsightWord, listInsightWords, removeInsightWord } from '$lib/server/services/insights';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * 気づきの言葉（レース直後に馬へ付ける、自分の言葉）。全レース共通で、本人だけのもの。
 * 消しても、これまで付けた気づきは残る（付けた言葉は文字列のコピー）。
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);
	return { words: await listInsightWords(db, user.id), limit: INSIGHT_WORDS_LIMIT };
};

export const actions: Actions = {
	add: async ({ locals, platform, request }) => {
		const { db, user } = ctx(locals, platform);
		const form = await request.formData();
		const raw = form.get('word');
		const parsed = v.safeParse(insightWordSchema, typeof raw === 'string' ? raw : '');
		if (!parsed.success) {
			return fail(400, {
				message: parsed.issues[0]?.message ?? '言葉を確認してください',
				word: typeof raw === 'string' ? raw : ''
			});
		}
		try {
			const result = await addInsightWord(db, user.id, parsed.output);
			if (!result.ok) {
				return result.reason === 'duplicate'
					? fail(409, { message: 'その言葉はすでに登録されています', word: parsed.output })
					: fail(400, {
							message: `登録できる言葉は${INSIGHT_WORDS_LIMIT}個までです。使わない言葉を削除してから足してください`,
							word: parsed.output
						});
			}
		} catch {
			// D1 の失敗は createDb の observer が記録する。入力を残して再試行できるようにする。
			return fail(503, {
				message: '言葉の登録を確認できませんでした。時間をおいてもう一度登録してください。',
				word: parsed.output
			});
		}
		return { added: parsed.output };
	},

	remove: async ({ locals, platform, request }) => {
		const { db, user } = ctx(locals, platform);
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
