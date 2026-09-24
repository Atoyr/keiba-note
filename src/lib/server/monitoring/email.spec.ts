import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	decodeSubject,
	extractAddress,
	handleNotificationEmail,
	isAllowedSender,
	type NotificationEmail
} from './email';

afterEach(() => {
	vi.restoreAllMocks();
});

const WEBHOOK = 'https://discord.com/api/webhooks/123/secret-token';
const ENV = { APP_ENV: 'production', DISCORD_WEBHOOK_URL: WEBHOOK };

function mail(over: { from?: string; headerFrom?: string; subject?: string } = {}) {
	const headers = new Headers();
	headers.set('from', over.headerFrom ?? 'Cloudflare <noreply@notify.cloudflare.com>');
	if (over.subject !== undefined) headers.set('subject', over.subject);
	const message: NotificationEmail = {
		from: over.from ?? 'bounces+123@notify.cloudflare.com',
		to: 'cf-alerts@uma-memo.com',
		headers,
		setReject: vi.fn()
	};
	return message;
}

function okFetch() {
	return vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
}

function sentPayload(fetchFn: ReturnType<typeof okFetch>) {
	return JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
}

describe('extractAddress', () => {
	it('表示名付きの From からアドレスだけを小文字で取り出す', () => {
		expect(extractAddress('Cloudflare <NoReply@Notify.Cloudflare.com>')).toBe(
			'noreply@notify.cloudflare.com'
		);
		expect(extractAddress(' noreply@cloudflare.com ')).toBe('noreply@cloudflare.com');
	});
});

describe('isAllowedSender', () => {
	it('cloudflare.com とそのサブドメインだけを通す', () => {
		expect(isAllowedSender('noreply@cloudflare.com')).toBe(true);
		expect(isAllowedSender('noreply@notify.cloudflare.com')).toBe(true);
		expect(isAllowedSender('someone@evilcloudflare.com')).toBe(false);
		expect(isAllowedSender('noreply@cloudflare.com.example')).toBe(false);
		expect(isAllowedSender('')).toBe(false);
	});
});

describe('decodeSubject', () => {
	it('UTF-8 の B と Q の encoded-word を戻し、続く語をつなぐ', () => {
		expect(decodeSubject('=?UTF-8?B?5LqI566X44Ki44Op44O844OI?=')).toBe('予算アラート');
		expect(decodeSubject('=?utf-8?Q?Budget_alert_=E2=80=94_uma?=')).toBe('Budget alert — uma');
		expect(decodeSubject('=?UTF-8?B?5LqI566X?= =?UTF-8?B?44Ki44Op44O844OI?=')).toBe('予算アラート');
	});

	it('encoded-word でない件名と、読めないものはそのまま返す', () => {
		expect(decodeSubject('Budget alert: uma-memo')).toBe('Budget alert: uma-memo');
		expect(decodeSubject('=?UTF-8?B?/w==?=')).toBe('=?UTF-8?B?/w==?=');
	});
});

describe('handleNotificationEmail', () => {
	it('Cloudflare からのメールは、件名を Discord に送る', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchFn = okFetch();
		const message = mail({ subject: 'Budget alert: uma-memo $1' });

		await handleNotificationEmail(message, ENV, fetchFn);

		expect(message.setReject).not.toHaveBeenCalled();
		expect(fetchFn).toHaveBeenCalledOnce();
		expect(fetchFn.mock.calls[0][0]).toBe(WEBHOOK);
		const [embed] = sentPayload(fetchFn).embeds;
		expect(embed.title).toBe('🟡 WARNING');
		expect(embed.fields).toContainEqual({
			name: 'subject',
			value: '```\nBudget alert: uma-memo $1\n```'
		});
		expect(embed.fields).toContainEqual({
			name: 'Event',
			value: '`cloudflare.notification`',
			inline: true
		});
		expect(embed.fields).toContainEqual({ name: 'Environment', value: 'production', inline: true });
		expect(embed.fields).toContainEqual({
			name: 'from',
			value: '```\nnoreply@notify.cloudflare.com\n```'
		});
	});

	it('封筒の From だけが Cloudflare のメールは断る（封筒は DMARC で守られず、誰でも偽れる）', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchFn = okFetch();
		const message = mail({ headerFrom: 'Billing <billing@example.net>', from: 'x@cloudflare.com' });

		await handleNotificationEmail(message, ENV, fetchFn);

		expect(message.setReject).toHaveBeenCalledWith('Unknown sender');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('件名はコードブロックに入れ、リンクや Markdown を効かせない', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchFn = okFetch();

		await handleNotificationEmail(mail({ subject: '[click](https://example.com)' }), ENV, fetchFn);

		const [embed] = sentPayload(fetchFn).embeds;
		expect(embed.description).not.toContain('example.com');
		expect(embed.fields).toContainEqual({
			name: 'subject',
			value: '```\n[click](https://example.com)\n```'
		});
	});

	it('Cloudflare 以外からのメールは断り、Discord に送らない', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchFn = okFetch();
		const message = mail({ headerFrom: 'spam@example.com', from: 'spam@example.com' });

		await handleNotificationEmail(message, ENV, fetchFn);

		expect(message.setReject).toHaveBeenCalledWith('Unknown sender');
		expect(fetchFn).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();
	});

	it('件名が無くても送る', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchFn = okFetch();

		await handleNotificationEmail(mail(), ENV, fetchFn);

		expect(sentPayload(fetchFn).embeds[0].fields).toContainEqual({
			name: 'subject',
			value: '```\n（件名なし）\n```'
		});
	});

	it('Webhook が無ければ送らない（ログには出す）', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchFn = okFetch();

		await handleNotificationEmail(mail({ subject: 'x' }), { APP_ENV: 'staging' }, fetchFn);

		expect(fetchFn).not.toHaveBeenCalled();
	});
});
