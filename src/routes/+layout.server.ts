import type { LayoutServerLoad } from './$types';

/** ヘッダの表示に使う。認証の判断そのものは hooks.server.ts が済ませている。 */
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user,
	mockAuth: locals.mockAuth,
	/** ステージングの印（AppEnvMark）を出すか。 */
	staging: locals.appEnv === 'staging'
});
