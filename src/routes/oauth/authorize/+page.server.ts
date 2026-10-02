import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	authorizeRequestSchema,
	isOwnResource,
	redirectUriMatches,
	requestedScopes,
	REQUIRED_SCOPES,
	sortScopes,
	type AuthorizeRequest
} from '$lib/schemas/oauth';
import { createAuthorizationCode, getClient } from '$lib/server/auth/oauth';
import type { Db } from '$lib/server/db';
import { ctx } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

/**
 * MCP クライアントへの同意画面（OAuth の認可エンドポイント）。**ログインが要る**（PUBLIC_PATHS に入れない）。
 * 未ログインなら hooks がログインへ回し、戻ってきたらここをもう一度開く。
 *
 * **要求の誤りは、どれも戻り先へ飛ばさずこの画面に出す。** RFC 6749 4.1.2.1 は client_id と redirect_uri が
 * 正しければ戻り先へ error を返すとするが、登録は誰でもでき、戻り先は https ならどこでも登録できる。
 * 誤った要求をわざと作れば、本人が何も押さないまま任意のサイトへ送れてしまう（オープンリダイレクト。RFC 9700 4.11.2）。
 * 戻り先へ送るのは、本人が「許可する」「許可しない」を押したときだけ。
 *
 * 同意のフォームは load の値を信じず、hidden の値を同じ手順でもう一度確かめる。
 */

const FIELDS = [
	'response_type',
	'client_id',
	'redirect_uri',
	'code_challenge',
	'code_challenge_method',
	'state',
	'scope',
	'resource'
] as const;

type Checked =
	| { kind: 'invalid'; message: string }
	| {
			kind: 'ok';
			request: AuthorizeRequest;
			client: { id: string; name: string; redirectHost: string };
	  };

/** 認可の要求を確かめる。読み取りは client の1クエリだけ。 */
async function check(db: Db, raw: Record<string, string>, origin: string): Promise<Checked> {
	const clientId = raw.client_id ?? '';
	const redirectUri = raw.redirect_uri ?? '';
	const client = clientId ? await getClient(db, clientId) : null;
	const invalid = (message: string) => ({ kind: 'invalid' as const, message });
	if (!client) return invalid('このアプリは登録されていません。');
	if (!redirectUriMatches(client.redirectUris, redirectUri)) {
		return invalid('戻り先がアプリの登録と一致しません。');
	}
	const parsed = v.safeParse(authorizeRequestSchema, raw);
	if (!parsed.success) {
		return invalid('アプリからの要求の形が正しくありません（PKCE などが足りません）。');
	}
	if (!isOwnResource(parsed.output.resource, origin)) {
		return invalid('このアプリは uma-memo 以外のサーバー向けの許可を求めています。');
	}
	return {
		kind: 'ok',
		request: parsed.output,
		client: { id: client.id, name: client.name, redirectHost: new URL(redirectUri).host }
	};
}

/** 戻り先に結果を付ける。`iss`（RFC 9207）で、どの認可サーバーからの返事かを示す。 */
function callbackUrl(
	redirectUri: string,
	origin: string,
	state: string | undefined,
	params: Record<string, string>
): string {
	const url = new URL(redirectUri);
	for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
	if (state !== undefined) url.searchParams.set('state', state);
	url.searchParams.set('iss', origin);
	return url.toString();
}

const pick = (get: (k: string) => string | null) =>
	Object.fromEntries(
		FIELDS.flatMap((k) => {
			const val = get(k);
			return val === null ? [] : [[k, val]];
		})
	) as Record<string, string>;

export const load: PageServerLoad = async ({ url, locals, platform, setHeaders }) => {
	// 同意のボタンを他サイトの枠に入れて押させない（クリックジャッキング）。
	// リファラは戻り先（別のサイト）に渡さない。`no-referrer` にはしない。同意のフォームの POST が
	// `Origin: null` で送られ、SvelteKit の CSRF の検査で 403 になる（E2E で確かめている）。
	setHeaders({
		'X-Frame-Options': 'DENY',
		'Content-Security-Policy': "frame-ancestors 'none'",
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'same-origin'
	});
	const { db } = ctx(locals, platform);
	const raw = pick((k) => url.searchParams.get(k));
	const checked = await check(db, raw, url.origin);
	if (checked.kind === 'invalid') return { invalid: checked.message } as const;

	const scopes = requestedScopes(checked.request.scope);
	return {
		invalid: null,
		client: checked.client,
		scopes,
		required: REQUIRED_SCOPES,
		params: raw
	};
};

export const actions: Actions = {
	default: async ({ request, url, locals, platform }) => {
		const { db, user } = ctx(locals, platform);
		const form = await request.formData();
		const raw = pick((k) => form.get(k)?.toString() ?? null);
		const checked = await check(db, raw, url.origin);
		if (checked.kind === 'invalid') return fail(400, { invalid: checked.message });
		const { request: req } = checked;

		if (form.get('decision') !== 'allow') {
			redirect(
				303,
				callbackUrl(req.redirect_uri, url.origin, req.state, {
					error: 'access_denied',
					error_description: '利用者が許可しませんでした'
				})
			);
		}

		// 許せるのは、求められたスコープのうち本人がチェックを残したものと、外せないもの。
		const asked = requestedScopes(req.scope);
		const checkedScopes = form.getAll('scope_grant').map(String);
		const scopes = sortScopes([
			...REQUIRED_SCOPES,
			...asked.filter((s) => checkedScopes.includes(s))
		]);

		const code = await createAuthorizationCode(db, {
			userId: user.id,
			clientId: req.client_id,
			scopes,
			redirectUri: req.redirect_uri,
			codeChallenge: req.code_challenge
		});
		if (!code) return fail(400, { invalid: '戻り先がアプリの登録と一致しません。' });
		redirect(303, callbackUrl(req.redirect_uri, url.origin, req.state, { code }));
	}
};
