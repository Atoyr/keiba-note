import { afterEach, describe, expect, it, vi } from 'vitest';
import { postDiscord, toDiscordPayload, type Alert } from './discord';

afterEach(() => {
	vi.restoreAllMocks();
});

const WEBHOOK = 'https://discord.com/api/webhooks/123/secret-token';
const NOW = new Date('2026-09-23T03:00:00Z');

const alert = (over: Partial<Alert> = {}): Alert => ({
	level: 'error',
	event: 'd1.query.failed',
	message: 'D1 のクエリが失敗した',
	environment: 'production',
	...over
});

describe('toDiscordPayload', () => {
	it('ERROR は赤の埋め込みで、event・環境・request id を並べる', () => {
		const payload = toDiscordPayload(alert({ requestId: '8c1f-NRT', durationMs: 820.4 }), NOW);
		const [embed] = payload.embeds;

		expect(embed.title).toBe('🔴 ERROR');
		expect(embed.color).toBe(0xdc2626);
		expect(embed.description).toBe('D1 のクエリが失敗した');
		expect(embed.timestamp).toBe('2026-09-23T03:00:00.000Z');
		expect(embed.fields).toEqual([
			{ name: 'Event', value: '`d1.query.failed`', inline: true },
			{ name: 'Environment', value: 'production', inline: true },
			{ name: 'Request ID', value: '`8c1f-NRT`', inline: true },
			{ name: 'Duration', value: '820ms', inline: true }
		]);
	});

	it('WARNING は黄色', () => {
		const [embed] = toDiscordPayload(alert({ level: 'warn', event: 'd1.query.slow' }), NOW).embeds;

		expect(embed.title).toBe('🟡 WARNING');
		expect(embed.color).toBe(0xeab308);
	});

	it('誰にもメンションしない（エラー文に @everyone が混ざっても）', () => {
		const payload = toDiscordPayload(alert({ message: '@everyone 落ちた' }), NOW);

		expect(payload.allowed_mentions).toEqual({ parse: [] });
	});

	it('補足とエラーはコードブロックに入れ、``` を崩さない', () => {
		const [embed] = toDiscordPayload(
			alert({
				details: { route: '/races/[id]', status: 500 },
				error: { name: 'Error', message: 'bad ```input```', causes: ['D1_ERROR: locked'] }
			}),
			NOW
		).embeds;

		expect(embed.fields).toContainEqual({ name: 'route', value: '```\n/races/[id]\n```' });
		expect(embed.fields).toContainEqual({ name: 'status', value: '```\n500\n```' });
		expect(embed.fields).toContainEqual({
			name: 'Error',
			value: "```\nError: bad '''input'''\nD1_ERROR: locked\n```"
		});
	});

	it('抑えた件数があれば添える', () => {
		const [embed] = toDiscordPayload(alert({ suppressed: 7 }), NOW).embeds;

		expect(embed.fields.at(-1)?.value).toContain('7 件');
	});

	it('長い文は Discord の上限より手前で切る', () => {
		const [embed] = toDiscordPayload(
			alert({ message: 'あ'.repeat(5000), details: { sql: 'x'.repeat(5000) } }),
			NOW
		).embeds;

		expect(embed.description.length).toBeLessThanOrEqual(4096);
		for (const field of embed.fields) expect(field.value.length).toBeLessThanOrEqual(1024);
	});
});

describe('postDiscord', () => {
	it('UTF-8 の JSON で POST し、日本語をそのまま送る', async () => {
		const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

		const ok = await postDiscord(WEBHOOK, toDiscordPayload(alert(), NOW), fetchFn);

		expect(ok).toBe(true);
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe(WEBHOOK);
		expect(init?.method).toBe('POST');
		expect(init?.headers).toEqual({ 'content-type': 'application/json; charset=utf-8' });
		expect(String(init?.body)).toContain('D1 のクエリが失敗した');
	});

	it('Discord が断っても投げずに false を返し、Webhook の URL をログに出さない', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));

		await expect(postDiscord(WEBHOOK, toDiscordPayload(alert(), NOW), fetchFn)).resolves.toBe(
			false
		);
		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({ event: 'monitoring.discord.failed', status: 429 })
		);
		expect(JSON.stringify(error.mock.calls)).not.toContain('secret-token');
	});

	it('届かなくても投げずに false を返し、エラーの中身（URL が入りうる）を出さない', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchFn = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new TypeError(`fetch failed: ${WEBHOOK}`));

		await expect(postDiscord(WEBHOOK, toDiscordPayload(alert(), NOW), fetchFn)).resolves.toBe(
			false
		);
		expect(JSON.stringify(error.mock.calls)).not.toContain('secret-token');
	});
});
