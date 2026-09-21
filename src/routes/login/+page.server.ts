import { redirect } from '@sveltejs/kit';
import { safeRedirect } from '$lib/utils/redirect';
import type { PageServerLoad } from './$types';

/** `?error=` で出し分けるメッセージ。状態を漏らさない粒度にとどめる。 */
const ERROR_MESSAGES: Record<string, string> = {
	invalid_request: 'ログインの手続きが中断されました。もう一度お試しください。',
	oauth_failed: 'Google との連携に失敗しました。もう一度お試しください。',
	unavailable: '現在ログインを受け付けられません。時間をおいてお試しください。'
};

export const load: PageServerLoad = ({ url, locals }) => {
	const redirectTo = safeRedirect(url.searchParams.get('redirect'));

	// ログイン済みなら素通りさせる。
	if (locals.user) redirect(302, redirectTo);

	const error = url.searchParams.get('error');
	return {
		redirectTo,
		errorMessage: error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.invalid_request) : null
	};
};
