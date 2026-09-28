/**
 * 共有の画像（`/shared/races/[id]/og.png`）に使うフォントを書き出す。
 *
 *   pnpm run og-font
 *
 * Noto Sans JP（google/fonts の可変フォント）を太字（wght 700）に固定し、ASCII と JIS X 0208 の文字
 * （かな・記号・第1〜第2水準の漢字）だけに絞って `static/og/` に置く。馬名はカタカナ、レース名と公開名に漢字が入る。
 * JIS X 0208 に無い字（第3水準以上・絵文字）は画像では出ない。
 *
 * Worker は描くときに Static Assets から読む（`lib/server/og/render.ts`）。Worker の本体に束ねないので、
 * Worker の容量には入らない。生成物なので手で直さない。書き出し直したら一緒にコミットする。
 * フォントは SIL Open Font License。配るときは許諾の文書を添える決まりなので、同じ場所に置く。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import subsetFont from 'subset-font';

export const OG_FONT_DIR = 'static/og';
export const OG_FONT_FILE = 'noto-sans-jp-bold.ttf';

const SOURCE = 'https://github.com/google/fonts/raw/main/ofl/notosansjp';
const CACHE_DIR = 'node_modules/.cache/og-font';

/** 取得元は 10MB 近いので、一度取ったら node_modules の下に置いて使い回す。 */
async function fetchCached(name: string): Promise<Buffer> {
	const path = join(CACHE_DIR, name);
	try {
		return await readFile(path);
	} catch {
		const res = await fetch(`${SOURCE}/${encodeURIComponent(name)}`);
		if (!res.ok) throw new Error(`${name} を取れませんでした: ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		await mkdir(CACHE_DIR, { recursive: true });
		await writeFile(path, buf);
		return buf;
	}
}

/**
 * JIS X 0208 の全文字。EUC-JP の2バイト（第1バイト・第2バイトとも 0xA1〜0xFE）を全部読み下す。
 * 割り当ての無い位置は置換文字（U+FFFD）になるので落とす。
 */
function jisX0208(): string {
	const decoder = new TextDecoder('euc-jp');
	const chars = new Set<string>();
	for (let hi = 0xa1; hi <= 0xfe; hi++) {
		for (let lo = 0xa1; lo <= 0xfe; lo++) {
			const c = decoder.decode(new Uint8Array([hi, lo]));
			if (c.length === 1 && c !== '�') chars.add(c);
		}
	}
	return [...chars].join('');
}

function ascii(): string {
	let s = '';
	for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
	return s;
}

/** JIS X 0208 に無いが、画面の文言（race-heading の「 · 」、馬番未定の「−」など）に出るもの。 */
const EXTRA = '·−—…｜';

async function main() {
	const [font, license] = await Promise.all([
		fetchCached('NotoSansJP[wght].ttf'),
		fetchCached('OFL.txt')
	]);
	const text = ascii() + jisX0208() + EXTRA;
	const subset = await subsetFont(font, text, {
		targetFormat: 'sfnt',
		variationAxes: { wght: 700 },
		noHinting: true
	});
	await mkdir(OG_FONT_DIR, { recursive: true });
	await writeFile(join(OG_FONT_DIR, OG_FONT_FILE), subset);
	await writeFile(join(OG_FONT_DIR, 'OFL.txt'), license);
	console.log(
		`${[...text].length} 字を ${join(OG_FONT_DIR, OG_FONT_FILE)} に書き出しました（${Math.round(subset.length / 1024)} KB）`
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
