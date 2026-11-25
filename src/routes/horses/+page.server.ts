import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { unfavoriteHorseSchema } from '#lib/schemas/favorite.ts';
import { setFavoriteHorse } from '#lib/server/services/favorites.ts';
import { listHorses } from '#lib/server/services/horses.ts';
import { ctx } from '#lib/server/util.ts';
import { parseOffset } from '#lib/utils/paging.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * 馬一覧。`?q=` で名前（とカナ）の部分一致に絞る。`?favorite=1` で本人の推しだけに絞る
 * （`q` と併用できる。それ以外の値は絞らない）。
 * `?offset=` は何件目から読むか（100件ずつ。画面は下端で続きを読む → `#lib/utils/paging`）。
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { db, user } = ctx(locals);
	const q = url.searchParams.get('q') ?? '';
	const favoriteOnly = url.searchParams.get('favorite') === '1';
	const offset = parseOffset(url.searchParams);
	return {
		horses: await listHorses(db, user.id, { q, favoriteOnly }, offset),
		q,
		favoriteOnly,
		offset
	};
};

export const actions: Actions = {
	/**
	 * 一覧の星から推しを外す。外すだけ（推しにするのは馬の画面）。本人の行しか消さないので、
	 * 無い馬の id でも何も起きず成功にする（馬の存在は確かめない）。
	 */
	unfavorite: async ({ locals, request }) => {
		const { db, user } = ctx(locals);
		const form = await request.formData();
		const parsed = v.safeParse(unfavoriteHorseSchema, {
			horseId: form.get('horseId')?.toString() ?? ''
		});
		if (!parsed.success) {
			return fail(400, {
				horseId: form.get('horseId')?.toString() ?? '',
				message: '推しから外せませんでした。もう一度星のボタンを押してください'
			});
		}
		await setFavoriteHorse(db, parsed.output.horseId, user.id, false);
		return { unfavorited: parsed.output.horseId };
	}
};
