import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { shareNoteSchema } from '$lib/schemas/note';
import { listSharedNotes, setNoteVisibility } from '$lib/server/services/notes';
import { ctx } from '$lib/server/util';
import { safeRedirect } from '$lib/utils/redirect';
import type { Actions, PageServerLoad } from './$types';

/**
 * 共有中のメモ一覧＝**共有を取り消す場所**。
 *
 * 共有の切り替えアクションもここに集約している。メモを出す画面は
 * ダッシュボード・レース詳細・予想・馬詳細と4つあるが、同じ action を
 * 4回書くより1箇所に置いて各画面から POST させるほうが崩れにくい。
 *
 * **`/notes/` 配下に置かないのが要点。** あちらは PUBLIC_PATHS に入っていて
 * 未ログインでも通るので、書き込みを置く場所として不適切。
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);
	return { notes: await listSharedNotes(db, user.id) };
};

export const actions: Actions = {
	default: async ({ request, locals, platform }) => {
		const { db, user } = ctx(locals, platform);

		const form = await request.formData();
		const parsed = v.safeParse(shareNoteSchema, {
			noteId: form.get('noteId')?.toString() ?? '',
			visibility: form.get('visibility')?.toString()
		});

		if (!parsed.success) return fail(400, { message: '操作を受け付けられませんでした' });

		// author_id を条件に入れてあるので、他人のメモは切り替えられない。
		// 該当が無いとき、存在しないのか他人のものなのかは区別して返さない。
		const ok = await setNoteVisibility(db, parsed.output.noteId, user.id, parsed.output.visibility);
		if (!ok) return fail(404, { message: 'メモが見つかりません' });

		// 呼び出し元の画面に戻す。`safeRedirect` が `//evil.com` 等を弾く。
		const back = form.get('redirect')?.toString();
		if (back) redirect(303, safeRedirect(back));

		return { shared: parsed.output.visibility === 'unlisted' };
	}
};
