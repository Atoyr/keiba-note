import { and, eq, gt } from 'drizzle-orm';
import * as v from 'valibot';
import { clientMetadataDocumentSchema, isClientIdMetadataUrl } from '$lib/schemas/oauth';
import type { Db } from '$lib/server/db';
import { oauthClient } from '$lib/server/db/schema';
import { readLimitedText } from './limited-body';
import { getClient, UNUSED_CLIENT_TTL_SEC, type OAuthClientView } from './oauth';

/**
 * Client ID Metadata Document（CIMD）。Claude が推奨する方式で、クライアントは自分の情報（名前・戻り先）を
 * 置いた HTTPS の URL を `client_id` として送ってくる。登録（`/oauth/register`）は要らない。
 *
 * **Worker が外の URL を取りに行く唯一の経路**（docs/architecture.md 3-10）。守っていること:
 * - 取りに行くのは、ログインした本人が同意画面を開いたとき（と許可を押したとき）だけ。誰でも叩ける口からは行かない
 * - URL の形を `isClientIdMetadataUrl` で絞る（https・パスあり・IP の直書きなし など）
 * - リダイレクトを追わない・5秒で打ち切る・本文は 5 KiB まで・JSON だけ
 * - 文書の `client_id` が URL と完全に一致しなければ使わない（別のクライアントの文書を指させない）
 * - 取れた文書は `oauth_client` に入れて24時間使う。取り直しに失敗したら古い内容は使わない
 */

export const CLIENT_METADATA_MAX_BYTES = 5 * 1024;
export const CLIENT_METADATA_TIMEOUT_MS = 5000;

export type MetadataFetch = (url: string, init: RequestInit) => Promise<Response>;

type Options = { now?: Date; fetcher?: MetadataFetch; allowLoopback?: boolean };

const sec = (now: Date) => Math.floor(now.getTime() / 1000);

/**
 * 同意画面で使うクライアント。CIMD の URL なら文書から（24時間は保存したものを使う）、そうでなければ
 * 動的登録の行から引く。使えなければ null（同意画面は「このアプリは登録されていません」を出す）。
 */
export async function resolveClient(
	db: Db,
	clientId: string,
	{ now = new Date(), fetcher = fetch, allowLoopback = false }: Options = {}
): Promise<OAuthClientView | null> {
	if (!isClientIdMetadataUrl(clientId, allowLoopback)) return getClient(db, clientId, now);

	const t = sec(now);
	const cached = await db
		.select({ id: oauthClient.id })
		.from(oauthClient)
		.where(
			and(
				eq(oauthClient.id, clientId),
				eq(oauthClient.source, 'metadata'),
				gt(oauthClient.fetchedAt, t - UNUSED_CLIENT_TTL_SEC)
			)
		)
		.limit(1);
	if (cached.length > 0) return getClient(db, clientId, now);

	const doc = await fetchClientMetadata(clientId, fetcher);
	if (!doc) return null;
	await db
		.insert(oauthClient)
		.values({
			id: clientId,
			name: doc.name,
			redirectUris: doc.redirectUris,
			source: 'metadata',
			fetchedAt: t
		})
		.onConflictDoUpdate({
			target: oauthClient.id,
			set: { name: doc.name, redirectUris: doc.redirectUris, fetchedAt: t }
		});
	return { id: clientId, name: doc.name, redirectUris: doc.redirectUris, source: 'metadata' };
}

/** 文書を取って確かめる。どこかで合わなければ null（理由は返さない。同意画面の文は1つでよい）。 */
export async function fetchClientMetadata(
	url: string,
	fetcher: MetadataFetch
): Promise<{ name: string; redirectUris: string[] } | null> {
	let res: Response;
	try {
		res = await fetcher(url, {
			method: 'GET',
			headers: { accept: 'application/json' },
			// 別の場所へ回されても追わない（確かめた URL と違う所の文書を読まない）。
			redirect: 'manual',
			signal: AbortSignal.timeout(CLIENT_METADATA_TIMEOUT_MS)
		});
	} catch {
		return null;
	}
	if (res.status !== 200) {
		await res.body?.cancel();
		return null;
	}
	if (!(res.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
		await res.body?.cancel();
		return null;
	}
	const text = await readLimitedText(res, CLIENT_METADATA_MAX_BYTES).catch(() => null);
	if (text === null) return null;
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return null;
	}
	const parsed = v.safeParse(clientMetadataDocumentSchema, json);
	if (!parsed.success || parsed.output.client_id !== url) return null;
	return {
		name: parsed.output.client_name || new URL(url).host,
		redirectUris: parsed.output.redirect_uris
	};
}
