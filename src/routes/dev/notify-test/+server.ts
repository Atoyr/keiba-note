import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Discord への通知の疎通確認。開発専用（docs/monitoring.md）。
 * `dev` ガードにより本番ビルドでは常に 404 になり、誰も外から通知を起こせない。
 *
 * `.dev.vars` に `DISCORD_WEBHOOK_URL` を入れて `pnpm run dev` し、POST すると
 * 本番と同じ経路（monitor → 連投抑制 → Discord）で ERROR を1件送る。
 */
export const POST: RequestHandler = async ({ locals, platform }) => {
	if (!dev) error(404, 'Not found');

	locals.monitor.log({
		level: 'error',
		event: 'monitoring.test',
		message: '通知のテストです（日本語が化けずに読めれば成功）',
		route: '/dev/notify-test',
		// 連投抑制に掛からないよう、毎回違う鍵にする。
		dedupeKey: `monitoring.test:${crypto.randomUUID()}`
	});

	return json({
		requestId: locals.monitor.requestId,
		webhook: platform?.env?.DISCORD_WEBHOOK_URL ? 'set' : 'missing'
	});
};
