import * as v from 'valibot';

/**
 * 招待の発行フォーム。
 * email は任意（空なら誰でも1回使える招待になる）。
 */
export const createInviteSchema = v.object({
	email: v.pipe(
		v.string(),
		v.trim(),
		v.union([v.literal(''), v.pipe(v.string(), v.email('メールアドレスの形式が正しくありません'))])
	)
});

export type CreateInviteInput = v.InferOutput<typeof createInviteSchema>;

export const revokeInviteSchema = v.object({
	inviteId: v.pipe(v.string(), v.minLength(1))
});
