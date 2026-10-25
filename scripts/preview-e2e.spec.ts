import { describe, expect, it } from 'vitest';
import { E2E_STATE } from '../e2e/seed.ts';
import { previewSteps, previewStopTarget } from './preview-e2e.ts';

describe('previewSteps', () => {
	it('seed → build → wrangler dev の順で起動する', () => {
		const steps = previewSteps();
		expect(steps).toHaveLength(3);
		expect(steps[0]).toEqual({
			command: 'node',
			args: ['--experimental-strip-types', 'e2e/seed.ts']
		});
		expect(steps[1]).toEqual({ command: 'npm', args: ['run', 'build'] });
		expect(steps[2].command).toBe('pnpm');
		expect(steps[2].args.slice(0, 3)).toEqual(['exec', 'wrangler', 'dev']);
	});

	it('既定のポートは 4173、E2E_PORT の値を渡すとそのポートを使う', () => {
		expect(previewSteps()[2].args.slice(3, 5)).toEqual(['--port', '4173']);
		expect(previewSteps(Number('4174'))[2].args.slice(3, 5)).toEqual(['--port', '4174']);
	});

	it('seed と同じ D1 と、E2E 専用の3つの変数を使う', () => {
		const server = previewSteps()[2].args.join(' ');
		expect(server).toContain(`--persist-to ${E2E_STATE} `);
		expect(server).toContain('--var DISCORD_WEBHOOK_URL: ');
		expect(server).toContain('--var GITHUB_DISPATCH_TOKEN: ');
		expect(server).toContain('--var OAUTH_CIMD_ALLOW_LOOPBACK:1');
	});
});

describe('previewStopTarget', () => {
	it.each(['linux', 'darwin'] as const)('POSIX (%s) は子へシグナルを渡す', (platform) => {
		expect(previewStopTarget(platform, 1234)).toEqual({ pid: 1234 });
	});

	it('Windows は taskkill で子の木ごと止める', () => {
		expect(previewStopTarget('win32', 1234)).toEqual({
			command: 'taskkill',
			args: ['/pid', '1234', '/T', '/F']
		});
	});
});
