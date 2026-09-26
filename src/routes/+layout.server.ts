import type { LayoutServerLoad } from './$types';

/** ヘッダの表示に使う。認証の判断そのものは hooks.server.ts が済ませている。 */
export const load: LayoutServerLoad = ({ locals, url }) => ({
	// 見えないヘッダのデータにも Google 名・メール・画像を載せない。
	user:
		url.pathname.startsWith('/notes/') || url.pathname.startsWith('/shared/races/')
			? null
			: locals.user,
	mockAuth: locals.mockAuth,
	/** ステージングの印（AppEnvMark）を出すか。 */
	staging: locals.appEnv === 'staging'
});
