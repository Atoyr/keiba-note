import { Google, decodeIdToken } from 'arctic';
import * as v from 'valibot';

/** Google の認可画面へ送るときに要求するスコープ。 */
export const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

/** state / code_verifier を持ち回すための一時 Cookie。10分だけ生かす。 */
export const OAUTH_STATE_COOKIE = 'google_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'google_code_verifier';
export const OAUTH_TTL_SECONDS = 60 * 10;

/** ログイン後に戻す先を持ち回すための一時 Cookie。 */
export const REDIRECT_COOKIE = 'login_redirect';

export type GoogleEnv = {
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
};

/**
 * Arctic の Google クライアントを作る。
 * リダイレクト URI は実行中のオリジンから組み立てるので、
 * localhost と *.workers.dev で設定を分けなくてよい。
 */
export function createGoogleClient(env: GoogleEnv, origin: string): Google {
	return new Google(
		env.GOOGLE_CLIENT_ID,
		env.GOOGLE_CLIENT_SECRET,
		`${origin}/auth/google/callback`
	);
}

/**
 * id_token から取り出したい部分。Google が返す claim のうち使うものだけ。
 *
 * `email_verified` が false のアカウントは弾く。招待の宛先照合を email で
 * 行っているので、未確認のアドレスを信用すると招待を横取りされうる。
 */
const idTokenClaims = v.object({
	sub: v.pipe(v.string(), v.minLength(1)),
	email: v.pipe(v.string(), v.email()),
	email_verified: v.literal(true),
	name: v.optional(v.string()),
	picture: v.optional(v.string())
});

export type GoogleIdentity = {
	googleSub: string;
	email: string;
	displayName: string;
	avatarUrl: string | null;
};

/**
 * id_token をデコードして必要な claim を取り出す。
 *
 * 署名の検証はしていない。トークンは PKCE + client_secret 付きで Google の
 * トークンエンドポイントから TLS 越しに直接受け取ったものなので、
 * OIDC Core 3.1.3.7 のとおりこの経路では署名検証を省略してよい。
 */
export function parseIdToken(idToken: string): GoogleIdentity | null {
	const parsed = v.safeParse(idTokenClaims, decodeIdToken(idToken));
	if (!parsed.success) return null;

	const claims = parsed.output;
	return {
		googleSub: claims.sub,
		email: claims.email,
		displayName: claims.name?.trim() || claims.email,
		avatarUrl: claims.picture ?? null
	};
}
