import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { pathToFileURL } from 'node:url';
import { E2E_STATE } from '../e2e/seed.ts';

/** E2E と単独プレビューで共通の、seed → build → サーバー起動の順番。 */
export function previewSteps(port = 4173): { command: string; args: string[] }[] {
	return [
		{ command: 'node', args: ['--experimental-strip-types', 'e2e/seed.ts'] },
		{ command: 'npm', args: ['run', 'build'] },
		{
			command: 'pnpm',
			args: [
				'exec',
				'wrangler',
				'dev',
				'--port',
				String(port),
				'--persist-to',
				E2E_STATE,
				'--var',
				'DISCORD_WEBHOOK_URL:',
				'--var',
				'GITHUB_DISPATCH_TOKEN:',
				'--var',
				'OAUTH_CIMD_ALLOW_LOOPBACK:1'
			]
		}
	];
}

/** シェルを含む子プロセス全体の止め方。 */
export function previewStopTarget(platform: NodeJS.Platform, pid: number) {
	return platform === 'win32'
		? ({ command: 'taskkill', args: ['/pid', String(pid), '/T', '/F'] } as const)
		: ({ pid } as const);
}

// 本番ビルドで走らせる（CSRF 検証が効くのはここだけ）。D1 は開発用と分けた E2E 専用のもの。
// seed が、その D1 をマイグレーションし、空にしてから e2e/seed.sql を流す。
// seed は wrangler dev より先に終わらせる。globalSetup に置くと、Playwright は webServer を
// 先に立ち上げるため、2つの workerd が同じ SQLite を開いて SQLITE_BUSY で落ちることがある。
// wrangler dev は .dev.vars を読むので、手元に Discord の Webhook を置いていても
// E2E から通知が飛ばないよう空で上書きする（--var が .dev.vars より勝つ）。
// GitHub のトークンも同じ。手元に置いていても、E2E から Actions を起動しない。
// OAUTH_CIMD_ALLOW_LOOPBACK は E2E だけ。テストが立てた http://localhost の Client ID Metadata Document を読ませる。
async function main(): Promise<void> {
	for (const { command, args } of previewSteps(Number(process.env.E2E_PORT ?? 4173))) {
		const status = await new Promise<number>((resolve) => {
			// POSIX はシェルを挟まず、pnpm にも停止シグナルが届くようにする。
			// Windows の npm・pnpm は .cmd なので shell が要る（引数に空白は無い）。
			const child =
				process.platform === 'win32'
					? spawn([command, ...args].join(' '), { stdio: 'inherit', shell: true })
					: spawn(command, args, { stdio: 'inherit' });
			let stopSignal: NodeJS.Signals | undefined;
			const stop = (signal: NodeJS.Signals) => {
				stopSignal = signal;
				if (!child.pid) return;
				const target = previewStopTarget(process.platform, child.pid);
				if ('command' in target) {
					const result = spawnSync(target.command, target.args, { stdio: 'inherit' });
					if (result.error) console.error(result.error);
				} else {
					try {
						child.kill(signal);
					} catch (error) {
						// 終了とシグナル送信が重なり、子が既に無い場合は止まっている。
						if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
					}
				}
			};
			const onInterrupt = () => stop('SIGINT');
			const onTerminate = () => stop('SIGTERM');
			process.on('SIGINT', onInterrupt);
			process.on('SIGTERM', onTerminate);
			child.on('error', (error) => console.error(error));
			child.on('close', (code, signal) => {
				process.off('SIGINT', onInterrupt);
				process.off('SIGTERM', onTerminate);
				const stoppedBy = stopSignal ?? signal;
				resolve(stoppedBy ? 128 + constants.signals[stoppedBy] : (code ?? 1));
			});
		});
		if (status !== 0) {
			process.exitCode = status;
			return;
		}
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
