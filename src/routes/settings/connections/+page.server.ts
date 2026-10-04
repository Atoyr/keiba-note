import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { listGrants, revokeGrant } from '$lib/server/auth/oauth';
import { MCP_PATH } from '$lib/server/auth/oauth-metadata';
import { getMcpUsage } from '$lib/server/services/mcp-usage';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * AI との連携（MCP）。接続先の URL と、本人が許可したアプリの一覧＝**連携を解除する場所**。
 * 解除すると、そのアプリのトークンは次の呼び出しから通らない（auth/oauth.ts の revokeGrant）。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);
	const [grants, usage] = await Promise.all([listGrants(db, user.id), getMcpUsage(db, user.id)]);
	return { mcpUrl: `${url.origin}${MCP_PATH}`, grants, usage };
};

export const actions: Actions = {
	revoke: async ({ request, locals, platform }) => {
		const { db, user } = ctx(locals, platform);
		const form = await request.formData();
		const parsed = v.safeParse(v.pipe(v.string(), v.minLength(1)), form.get('grantId'));
		if (!parsed.success) return fail(400, { message: '操作を受け付けられませんでした' });
		// user_id を条件に入れてあるので、他人の連携は解除できない。無いのか他人のものかは区別しない。
		if (!(await revokeGrant(db, parsed.output, user.id))) {
			return fail(404, { message: '連携が見つかりません' });
		}
		return { revoked: true };
	}
};
