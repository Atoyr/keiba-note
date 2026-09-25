import { describe, expect, it, vi } from 'vitest';
import {
	DispatchError,
	dispatchEntriesFetch,
	isDispatchConfigured,
	workflowInputs,
	type EntriesFetchRequest
} from './dispatch';

const REQ: EntriesFetchRequest = {
	date: '2026-09-27',
	course: '中山',
	raceNumber: 11,
	externalRef: 'nk-202606040911',
	requireConfirmed: true,
	trigger: 'cron'
};

const config = (fetchFn: typeof fetch) => ({
	token: 'ghp_test',
	repository: 'Atoyr/keiba-note',
	fetchFn
});

describe('workflowInputs', () => {
	it('値をすべて文字列にし、external_ref から race_id を取り出す', () => {
		expect(workflowInputs(REQ)).toEqual({
			date: '2026-09-27',
			course: '中山',
			race_number: '11',
			race_id: '202606040911',
			require_confirmed: 'true',
			trigger: 'cron'
		});
	});

	it('race_id が読めなければ渡さない（Actions がレース一覧から引く）', () => {
		expect(workflowInputs({ ...REQ, externalRef: null })).not.toHaveProperty('race_id');
		expect(workflowInputs({ ...REQ, externalRef: 'jra-123' })).not.toHaveProperty('race_id');
	});
});

describe('dispatchEntriesFetch', () => {
	it('main のワークフローを inputs 付きで起動する', async () => {
		const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
		await dispatchEntriesFetch(config(fetchFn), REQ);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(
			'https://api.github.com/repos/Atoyr/keiba-note/actions/workflows/race-data-fetch.yml/dispatches'
		);
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_test');
		expect(JSON.parse(init.body as string)).toEqual({ ref: 'main', inputs: workflowInputs(REQ) });
	});

	it('トークンかリポジトリが無ければ、GitHub へ行かずに not-configured', async () => {
		const fetchFn = vi.fn();
		for (const c of [
			{ token: '', repository: 'Atoyr/keiba-note', fetchFn },
			{ token: 't', repository: undefined, fetchFn },
			{ token: 't', repository: 'not a repo', fetchFn }
		]) {
			await expect(dispatchEntriesFetch(c, REQ)).rejects.toMatchObject({ kind: 'not-configured' });
			expect(isDispatchConfigured(c)).toBe(false);
		}
		expect(fetchFn).not.toHaveBeenCalled();
		expect(isDispatchConfigured(config(fetchFn))).toBe(true);
	});

	it.each([
		[401, {}, 'auth'],
		[403, {}, 'auth'],
		[403, { 'x-ratelimit-remaining': '0' }, 'rate-limited'],
		[429, {}, 'rate-limited'],
		[404, {}, 'http'],
		[422, {}, 'http'],
		[502, {}, 'network']
	])('%i は %o なら %s', async (status, headers, kind) => {
		const fetchFn = vi.fn(
			async () => new Response(JSON.stringify({ message: 'x' }), { status, headers })
		);
		const err = await dispatchEntriesFetch(config(fetchFn), REQ).catch((e) => e);
		expect(err).toBeInstanceOf(DispatchError);
		expect(err.kind).toBe(kind);
		// トークンを message に載せない（ログに出る）
		expect(err.message).not.toContain('ghp_test');
	});

	it('届かなければ network', async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		await expect(dispatchEntriesFetch(config(fetchFn), REQ)).rejects.toMatchObject({
			kind: 'network'
		});
	});
});
