import { describe, expect, it, vi } from 'vitest';
import { OddsError } from '../odds';
import { NetkeibaOddsProvider, netkeibaRaceId } from './provider';
import result from './fixtures/result.json';

/**
 * 通信は差し替える。**通常のテストで netkeiba には取りに行かない**（CI から叩かない）。
 * 確かめたいのは、URL の組み立てと、HTTP の結果が失敗の種類にどう振り分けられるか。
 */
function provider(respond: () => Response | Promise<Response>) {
	const fetchFn = vi.fn<typeof fetch>(async () => respond());
	return {
		fetchFn,
		p: new NetkeibaOddsProvider({ fetchFn, now: () => new Date('2026-09-27T05:31:00Z') })
	};
}

const input = { raceId: 'r1', externalRaceId: 'nk-202609040711' };

async function kindOf(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;
	} catch (e) {
		if (e instanceof OddsError) return e.kind;
		throw e;
	}
	return undefined;
}

describe('netkeibaRaceId', () => {
	it('nk- に12桁の ref だけを読む', () => {
		expect(netkeibaRaceId('nk-202606040911')).toBe('202606040911');
		expect(netkeibaRaceId('202606040911')).toBeNull();
		expect(netkeibaRaceId('nk-2022103875')).toBeNull(); // 馬の ref（10桁）
	});
});

describe('NetkeibaOddsProvider', () => {
	it('単勝・複勝の API を race_id で1回だけ呼び、読み替えて返す', async () => {
		const { p, fetchFn } = provider(() => Response.json(result));
		const odds = await p.getRaceOdds(input);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const url = new URL(String(fetchFn.mock.calls[0][0]));
		expect(url.origin + url.pathname).toBe('https://race.netkeiba.com/api/api_get_jra_odds.html');
		expect(url.searchParams.get('race_id')).toBe('202609040711');
		expect(url.searchParams.get('type')).toBe('1');
		expect(odds.raceId).toBe('r1');
		expect(odds.horses).toHaveLength(11);
		expect(odds.fetchedAt).toBe('2026-09-27T05:31:00.000Z');
	});

	it('netkeiba の形でない ref は取りに行かない', async () => {
		const { p, fetchFn } = provider(() => Response.json(result));
		expect(await kindOf(p.getRaceOdds({ raceId: 'r1', externalRaceId: 'jra-1' }))).toBe(
			'unsupported-ref'
		);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it.each([
		[429, 'rate-limited'],
		[503, 'network'],
		[404, 'http']
	])('HTTP %i は %s', async (status, kind) => {
		const { p } = provider(() => new Response('', { status }));
		expect(await kindOf(p.getRaceOdds(input))).toBe(kind);
	});

	it('失敗した応答はステータス・見分けに使うヘッダ・本文の先頭を持って投げる', async () => {
		const { p } = provider(
			() =>
				new Response(
					`<html>
<body>${'Bad Request '.repeat(40)}</body></html>`,
					{
						status: 400,
						headers: {
							server: 'CloudFront',
							'x-cache': 'Error from cloudfront',
							'x-amz-cf-pop': 'NRT57-P1',
							'set-cookie': 'a=b'
						}
					}
				)
		);
		const e = await p.getRaceOdds(input).catch((e: unknown) => e);

		expect(e).toBeInstanceOf(OddsError);
		const { response } = e as OddsError;
		expect(response?.status).toBe(400);
		// set-cookie のような見分けに使わないヘッダは載せない
		expect(response?.headers).toEqual({
			'content-type': 'text/plain;charset=UTF-8',
			server: 'CloudFront',
			'x-cache': 'Error from cloudfront',
			'x-amz-cf-pop': 'NRT57-P1'
		});
		// 改行は詰め、長い本文は先頭だけ
		expect(response?.body.startsWith('<html> <body>Bad Request')).toBe(true);
		expect(response?.body).toHaveLength(300);
	});

	it('届かなければ network', async () => {
		const { p } = provider(() => {
			throw new TypeError('fetch failed');
		});
		expect(await kindOf(p.getRaceOdds(input))).toBe('network');
	});

	it('JSON でなければ parse', async () => {
		const { p } = provider(() => new Response('<html>メンテナンス中</html>'));
		expect(await kindOf(p.getRaceOdds(input))).toBe('parse');
	});
});
