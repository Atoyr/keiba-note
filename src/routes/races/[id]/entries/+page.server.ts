import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { entriesSchema } from '$lib/schemas/race';
import { isUniqueViolation, violatedIndex } from '$lib/server/db/errors';
import { getRace, listEntries, saveEntries } from '$lib/server/services/races';
import { ctxAdmin } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/** 空行を含めて常にこの数だけ入力欄を出す。 */
const MIN_ROWS = 10;

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	const { db } = ctxAdmin(locals, platform);

	const [race, entries] = await Promise.all([getRace(db, params.id), listEntries(db, params.id)]);
	if (!race) error(404, 'レースが見つかりません');

	return { race, entries, minRows: Math.max(MIN_ROWS, entries.length + 3) };
};

export const actions: Actions = {
	default: async ({ locals, platform, params, request }) => {
		const { db, user } = ctxAdmin(locals, platform);

		const race = await getRace(db, params.id);
		if (!race) error(404, 'レースが見つかりません');

		const form = await request.formData();

		// name="horseName.0" のような添字付きフィールドを行にまとめ直す。
		const count = Number(form.get('rowCount') ?? 0);
		const rows = Array.from({ length: count }, (_, i) => ({
			horseName: form.get(`horseName.${i}`)?.toString() ?? '',
			bracket: form.get(`bracket.${i}`)?.toString() ?? '',
			horseNumber: form.get(`horseNumber.${i}`)?.toString() ?? '',
			jockey: form.get(`jockey.${i}`)?.toString() ?? '',
			finishPosition: form.get(`finishPosition.${i}`)?.toString() ?? '',
			finishTime: form.get(`finishTime.${i}`)?.toString() ?? '',
			margin: form.get(`margin.${i}`)?.toString() ?? '',
			last3f: form.get(`last3f.${i}`)?.toString() ?? '',
			popularity: form.get(`popularity.${i}`)?.toString() ?? ''
		})).filter((r) => r.horseName.trim() !== '');

		const parsed = v.safeParse(entriesSchema, rows);
		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
		}

		// 同じ馬を2回書いていないか（UNIQUE 違反にする前に気づかせる）。
		const names = parsed.output.map((r) => r.horseName);
		const dup = names.find((n, i) => names.indexOf(n) !== i);
		if (dup) return fail(400, { message: `「${dup}」が重複しています` });

		try {
			await saveEntries(db, params.id, parsed.output, user.id);
		} catch (e) {
			if (isUniqueViolation(e)) {
				const idx = violatedIndex(e) ?? '';
				return fail(409, {
					message: idx.includes('horse_number')
						? '馬番が重複しています'
						: '同じ馬が2回登録されています'
				});
			}
			throw e;
		}

		redirect(303, `/races/${params.id}`);
	}
};
