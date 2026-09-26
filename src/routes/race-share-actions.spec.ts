import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { setPublicName } from '$lib/server/services/profile';
import { publishRaceSummary, revokeRaceShare } from '$lib/server/services/race-shares';
import { actions as profile } from './settings/profile/+page.server';
import { actions as summary } from './races/[id]/summary/+page.server';
import { actions as shares } from './settings/shares/+page.server';

vi.mock('$lib/server/util', () => ({ ctx: () => ({ db: {}, user: { id: 'me' } }) }));
vi.mock('$lib/server/services/profile');
vi.mock('$lib/server/services/race-shares');

const event = <Route extends '/settings/profile' | '/settings/shares' | '/races/[id]/summary'>(
	route: Route,
	form: Record<string, string> = {}
) =>
	({
		params: { id: 'race' },
		route: { id: route },
		request: new Request('http://localhost/settings/profile', {
			method: 'POST',
			body: new URLSearchParams(form)
		})
	}) as unknown as RequestEvent<{ id: string }, Route>;

beforeEach(() => vi.resetAllMocks());

describe('共有と公開名の保存失敗', () => {
	it('公開名のDB失敗は入力を保持し、再試行を案内する', async () => {
		vi.mocked(setPublicName).mockRejectedValue(new Error('DB failure with private params'));
		const result = await profile.default!(event('/settings/profile', { publicName: 'うま日和' }));
		expect(result).toMatchObject({
			status: 503,
			data: { publicName: 'うま日和', message: expect.stringContaining('もう一度保存') }
		});
		expect(JSON.stringify(result)).not.toContain('private params');
	});
	it('共有作成・更新に失敗しても成功のメッセージやURLを返さない', async () => {
		vi.mocked(publishRaceSummary).mockRejectedValue(new Error('DB unavailable'));
		expect(await summary.share!(event('/races/[id]/summary'))).toMatchObject({
			status: 503,
			data: { failed: true, message: expect.stringContaining('保存を確認できませんでした') }
		});
	});
	it('まとめからの解除に失敗したら、解除済みとは表示しない', async () => {
		vi.mocked(revokeRaceShare).mockRejectedValue(new Error('DB unavailable'));
		expect(await summary.revoke!(event('/races/[id]/summary'))).toMatchObject({
			status: 503,
			data: { failed: true, message: expect.stringContaining('解除を確認できませんでした') }
		});
	});
	it('共有一覧からの解除も再試行を案内する', async () => {
		vi.mocked(revokeRaceShare).mockRejectedValue(new Error('DB unavailable'));
		expect(await shares.default!(event('/settings/shares', { raceId: 'race' }))).toMatchObject({
			status: 503,
			data: { message: expect.stringContaining('もう一度「共有をやめる」') }
		});
	});
});
