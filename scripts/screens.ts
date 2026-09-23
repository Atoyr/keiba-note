/**
 * PR に貼るキャプチャを撮る（docs/harness.md）。
 *
 *   pnpm run screens <機能名> before [画面名...]   # 手を入れる前に撮る
 *   pnpm run screens <機能名> after  [画面名...]   # 直したあとに撮る
 *
 * `e2e/screens.e2e.ts` を本番ビルド + E2E 専用 D1 で走らせ、
 * `docs/screenshots/<機能名>/<before|after>/<画面名>.<desktop|mobile>.png` に置く。
 * 画面名は `e2e/screens.ts` の name。省けば全画面。
 *
 * after のときは before と見比べ、見た目が変わらなかった組は両方消す
 * （比べるのは `screens.e2e.ts`）。残ったものが「この変更で見た目が変わった画面」で、
 * 人が見るのはそれだけになる。
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [feature, label, ...only] = process.argv.slice(2);

if (
	!feature ||
	!/^[a-z0-9][a-z0-9-]*$/.test(feature) ||
	(label !== 'before' && label !== 'after') ||
	only.some((name) => !/^[a-z0-9][a-z0-9-]*$/.test(name))
) {
	console.error(
		'usage: pnpm run screens <機能名> <before|after> [画面名...]（名前は英小文字とハイフン）'
	);
	process.exit(2);
}

const root = join('docs', 'screenshots', feature);
const out = join(root, label);
const before = join(root, 'before');

// 前回の撮り直しが混ざらないように、撮る範囲だけ先に消す。
if (only.length === 0) {
	rmSync(out, { recursive: true, force: true });
} else if (existsSync(out)) {
	for (const f of readdirSync(out)) {
		if (only.includes(f.split('.')[0])) rmSync(join(out, f));
	}
}

// 画面名は上で英小文字とハイフンだけに絞ったので、そのまま正規表現に入れてよい。
// 括弧を `\(` でなく `[(]` で書くのは、Windows の cmd がバックスラッシュを落とすため。
const grep = only.length > 0 ? ` --grep "画面 (${only.join('|')}) [(]"` : '';

// pnpm は Windows では .cmd なので shell 経由で起動する。引数は上で検証済み。
execSync(`pnpm exec playwright test e2e/screens.e2e.ts${grep}`, {
	stdio: 'inherit',
	env: {
		...process.env,
		SCREENS_OUT: out,
		...(label === 'after' && existsSync(before) ? { SCREENS_BEFORE: before } : {})
	}
});

if (label === 'after') {
	const files = existsSync(out) ? readdirSync(out).sort() : [];
	const changed = files.filter((f) => existsSync(join(before, f)));
	const added = files.filter((f) => !existsSync(join(before, f)));

	console.log(`\n見た目が変わった画面: ${changed.length} / before の無い画面: ${added.length}`);
	for (const f of changed) console.log(`  ~ ${join(out, f)}`);
	for (const f of added) console.log(`  + ${join(out, f)}`);
	if (files.length === 0) {
		rmSync(root, { recursive: true, force: true });
		console.log('見た目の変わった画面はありません。docs/screenshots には何も残していません。');
	}
}
