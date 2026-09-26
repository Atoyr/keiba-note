import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { publicNameSchema } from '$lib/schemas/profile';
import { getPublicName, setPublicName } from '$lib/server/services/profile';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db, user } = ctx(locals, platform);
	return { publicName: await getPublicName(db, user.id) };
};

export const actions: Actions = {
	default: async ({ locals, platform, request }) => {
		const { db, user } = ctx(locals, platform);
		const form = await request.formData();
		const publicName = form.get('publicName');
		const parsed = v.safeParse(publicNameSchema, { publicName });
		if (!parsed.success)
			return fail(400, {
				message: parsed.issues[0].message,
				publicName: typeof publicName === 'string' ? publicName : ''
			});
		try {
			await setPublicName(db, user.id, parsed.output.publicName);
		} catch {
			// D1 の失敗は createDb の observer が記録する。入力値を残して再試行できるようにする。
			return fail(503, {
				message: '公開用の名前の保存を確認できませんでした。時間をおいてもう一度保存してください。',
				publicName: parsed.output.publicName
			});
		}
		return { saved: true };
	}
};
