/**
 * オッズの更新を1回ぶん回す。GitHub Actions（`.github/workflows/odds-update.yml`）が30分おきに呼ぶ。
 *
 * **取得は Worker ではなくここでする。** netkeiba の手前（CloudFront）は、Cloudflare Workers から来たリクエストを
 * 時間帯によってまとめて 400 で返す（レースのある日の日中はほぼ取れない）。GitHub Actions からは同じ時間帯でも取れた
 * （docs/architecture.md 3-8）。
 *
 * D1 は `wrangler d1 execute` で読み書きする（`data:import:remote` と同じ `CLOUDFLARE_API_TOKEN`）。
 *
 *   node --experimental-strip-types scripts/odds-update.ts            # 本番 D1（Actions から）
 *   node --experimental-strip-types scripts/odds-update.ts --local    # 手元の D1 で試す
 *
 * ログは1件ずつ JSON で1行に出す。人が手を入れる必要があるもの（level が error か notify: true）が
 * 1件でもあれば終了コード 1 で終え、ワークフローが Discord に知らせる（docs/monitoring.md）。
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describeError } from '../src/lib/server/monitoring/log.ts';
import { NetkeibaOddsProvider } from './odds/netkeiba/provider.ts';
import { pickTargets, saveOddsSql, targetsSql, type TargetRow } from './odds/store.ts';
import { updateOdds, type OddsLogEntry, type OddsStore } from './odds/update.ts';

const WRANGLER = join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB_NAME = 'k-note';

/** `wrangler d1 execute --json` を流し、文ごとの結果の行を返す。落ちたら投げる。 */
function d1(target: '--remote' | '--local', sql: string): unknown[][] {
	const result = spawnSync(
		process.execPath,
		[WRANGLER, 'd1', 'execute', DB_NAME, target, '--json', '--command', sql],
		{ encoding: 'utf8' }
	);
	const raw = result.stdout ?? '';
	const start = raw.search(/[[{]/);
	if (result.status !== 0 || start < 0) {
		throw new Error(`wrangler d1 execute が失敗した（終了コード ${result.status}）`, {
			cause: (result.stderr || raw).trim().slice(0, 500)
		});
	}
	const parsed = JSON.parse(raw.slice(start)) as Array<{ results?: unknown[] }>;
	return parsed.map((r) => r.results ?? []);
}

function d1Store(target: '--remote' | '--local'): OddsStore {
	return {
		listTargets: async (now) =>
			pickTargets((d1(target, targetsSql(now))[0] ?? []) as TargetRow[], now),
		save: async (odds) => {
			d1(target, saveOddsSql(odds));
		}
	};
}

/** 人が手を入れる必要があるものか（docs/monitoring.md の odds.fetch の表と同じ基準）。 */
const needsHuman = (entry: OddsLogEntry) => entry.level === 'error' || entry.notify === true;

async function main() {
	const target = process.argv.includes('--local') ? '--local' : '--remote';
	let failed = false;

	const log = ({ error, ...entry }: OddsLogEntry) => {
		const line = { ...entry, ...(error === undefined ? {} : { error: describeError(error) }) };
		console.log(JSON.stringify(line));
		if (needsHuman(entry)) {
			failed = true;
			// Actions の画面（run の概要）に出す
			console.log(`::error title=${entry.event}::${entry.message}`);
		}
	};

	try {
		const summary = await updateOdds({
			store: d1Store(target),
			provider: new NetkeibaOddsProvider(),
			log
		});
		console.log(
			JSON.stringify({
				level: 'info',
				event: 'odds.cron',
				message: 'オッズの更新を終えた',
				...summary
			})
		);
	} catch (e) {
		log({
			level: 'error',
			event: 'odds.cron.failed',
			message: 'オッズの更新を始められなかった',
			error: e
		});
	}
	if (failed) process.exitCode = 1;
}

await main();
