import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { raceSchema } from '$lib/schemas/race';
import { isUniqueViolation } from '$lib/server/db/errors';
import { createRace } from '$lib/server/services/races';
import { todayJst } from '$lib/server/services/notes';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, platform }) => {
	ctx(locals, platform);
	return { today: todayJst() };
};

export const actions: Actions = {
	default: async ({ locals, platform, request }) => {
		const { db, user } = ctx(locals, platform);

		const form = await request.formData();
		const raw = Object.fromEntries(
			[
				'date',
				'course',
				'raceNumber',
				'name',
				'grade',
				'className',
				'surface',
				'distance',
				'direction',
				'trackCondition',
				'weather'
			].map((k) => [k, form.get(k)?.toString() ?? ''])
		);

		const parsed = v.safeParse(raceSchema, raw);
		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください', raw });
		}

		let id: string;
		try {
			id = await createRace(db, parsed.output, user.id);
		} catch (e) {
			// race_ident (date, course, race_number) の UNIQUE 違反。
			// Drizzle が元のエラーを包むので cause を辿って判定する。
			if (isUniqueViolation(e)) {
				return fail(409, { message: '同じ日付・競馬場・レース番号のレースが既にあります', raw });
			}
			throw e;
		}

		// 登録したらそのまま出走馬の入力へ。ふりかえりはそのあと。
		redirect(303, `/races/${id}/entries`);
	}
};
