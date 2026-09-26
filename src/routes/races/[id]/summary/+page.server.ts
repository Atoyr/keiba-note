import { error, fail } from '@sveltejs/kit';
import { getPublicName } from '$lib/server/services/profile';
import {
	getOwnRaceShare,
	getRaceSummary,
	publishRaceSummary,
	revokeRaceShare
} from '$lib/server/services/race-shares';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, params, setHeaders }) => {
	const { db, user } = ctx(locals, platform);
	setHeaders({ 'cache-control': 'private, no-store' });
	const [summary, share, publicName] = await Promise.all([
		getRaceSummary(db, params.id, user.id),
		getOwnRaceShare(db, params.id, user.id),
		getPublicName(db, user.id)
	]);
	if (!summary) error(404, 'レースが見つかりません');
	return {
		raceId: params.id,
		summary,
		shareId: share?.id ?? null,
		changed: share ? JSON.stringify(share.content) !== JSON.stringify(summary) : false,
		authorName: publicName ?? '匿名'
	};
};

export const actions: Actions = {
	share: async ({ locals, platform, params }) => {
		const { db, user } = ctx(locals, platform);
		let share;
		try {
			share = await publishRaceSummary(db, params.id, user.id);
		} catch {
			// D1 の失敗は observer で記録済み。公開できたと誤認させない。
			return fail(503, {
				failed: true,
				message: '共有内容の保存を確認できませんでした。時間をおいてもう一度お試しください。'
			});
		}
		if (!share)
			return fail(400, {
				failed: true,
				message: '共有する予想がありません。予想画面で見立てや印を保存してください。'
			});
		return { message: '共有内容を保存しました。下のリンクを共有できます。' };
	},
	revoke: async ({ locals, platform, params }) => {
		const { db, user } = ctx(locals, platform);
		try {
			await revokeRaceShare(db, params.id, user.id);
		} catch {
			return fail(503, {
				failed: true,
				message:
					'共有の解除を確認できませんでした。時間をおいてもう一度「共有をやめる」を押してください。'
			});
		}
		return { message: '共有をやめました。以前のリンクは開けません。' };
	}
};
