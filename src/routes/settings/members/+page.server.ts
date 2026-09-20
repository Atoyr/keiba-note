import { error, fail } from '@sveltejs/kit';
import { desc, isNull } from 'drizzle-orm';
import * as v from 'valibot';
import { createInvite, listInvites, revokeInvite } from '$lib/server/auth/invite';
import { createDb } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { createInviteSchema, revokeInviteSchema } from '$lib/schemas/invite';
import type { Actions, PageServerLoad } from './$types';

/**
 * メンバーと招待の管理。owner だけが触れる。
 *
 * 「操作の可否」はルート層で弾く（architecture.md 3-6）。
 * UI の作り込みは Phase 4。ここでは最低限。
 */
function requireOwner(locals: App.Locals) {
	if (!locals.user) error(401, 'ログインが必要です');
	if (locals.user.role !== 'owner') error(403, 'この操作は owner だけが行えます');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireOwner(locals);
	if (!platform?.env?.DB) error(503, 'データベースに接続できません');

	const db = createDb(platform.env);

	const [members, invites] = await Promise.all([
		db
			.select({
				id: user.id,
				email: user.email,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
				role: user.role,
				createdAt: user.createdAt
			})
			.from(user)
			.where(isNull(user.deletedAt))
			.orderBy(desc(user.createdAt)),
		listInvites(db)
	]);

	return { members, invites };
};

export const actions: Actions = {
	create: async ({ locals, platform, request }) => {
		const owner = requireOwner(locals);
		if (!platform?.env?.DB) error(503, 'データベースに接続できません');

		const form = await request.formData();
		const parsed = v.safeParse(createInviteSchema, {
			email: form.get('email')?.toString() ?? ''
		});

		if (!parsed.success) {
			return fail(400, { message: parsed.issues[0]?.message ?? '入力を確認してください' });
		}

		const created = await createInvite(createDb(platform.env), {
			invitedBy: owner.id,
			email: parsed.output.email || null
		});

		return { createdCode: created.code };
	},

	revoke: async ({ locals, platform, request }) => {
		requireOwner(locals);
		if (!platform?.env?.DB) error(503, 'データベースに接続できません');

		const form = await request.formData();
		const parsed = v.safeParse(revokeInviteSchema, {
			inviteId: form.get('inviteId')?.toString() ?? ''
		});

		if (!parsed.success) return fail(400, { message: '取り消せませんでした' });

		const ok = await revokeInvite(createDb(platform.env), parsed.output.inviteId);
		if (!ok) return fail(409, { message: '使用済みの招待は取り消せません' });

		return { revoked: true };
	}
};
