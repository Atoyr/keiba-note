import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { CARD_FONT } from '$lib/utils/share-card';

/**
 * SVG を PNG にする（共有の画像。`/shared/races/[id]/og.png`）。
 *
 * 描くのは resvg（Rust 製の SVG 描画を wasm にしたもの）。Workers は実行中に wasm をバイト列から
 * コンパイルできないので、wasm は `src/worker.js` が import して（wrangler がコンパイル済みの
 * `WebAssembly.Module` にする）、ルートが `platform.env.RESVG_WASM` から渡す。
 * フォントは Worker の本体に束ねず、Static Assets（`static/og/`）から読む（scripts/og-font.ts）。
 *
 * **wasm の初期化とフォントは isolate ごとに1度だけ**にし、モジュールスコープに置く。
 * resvg の初期化は2度呼ぶと例外になる。どちらも利用者やリクエストに依らない不変のものなので、
 * 使い回してよい（architecture.md 第0章が止めているのは接続とユーザー情報）。失敗したら捨てて、次で取り直す。
 */
export type OgAssets = {
	wasm: WebAssembly.Module;
	loadFont: () => Promise<Uint8Array>;
};

let ready: Promise<void> | undefined;
let font: Promise<Uint8Array> | undefined;

export async function renderPng(svg: string, assets: OgAssets): Promise<Uint8Array<ArrayBuffer>> {
	ready ??= initWasm(assets.wasm).catch((e) => {
		ready = undefined;
		throw e;
	});
	font ??= assets.loadFont().catch((e) => {
		font = undefined;
		throw e;
	});
	const [, fontBuffer] = await Promise.all([ready, font]);
	const resvg = new Resvg(svg, {
		font: { fontBuffers: [fontBuffer], defaultFontFamily: CARD_FONT }
	});
	// wasm 側のメモリは GC で返らないので、使い終わったら自分で返す。
	try {
		const image = resvg.render();
		try {
			// wasm のメモリから JS 側に写した配列で、中身は普通の ArrayBuffer（Response にそのまま渡せる）。
			return image.asPng() as Uint8Array<ArrayBuffer>;
		} finally {
			image.free();
		}
	} finally {
		resvg.free();
	}
}

/** `static/og/` のフォント（scripts/og-font.ts が書き出す）。名前を変えたら両方を変える。 */
export const OG_FONT_PATH = '/og/noto-sans-jp-bold.ttf';

/** Static Assets のバインディングからフォントを読む。ホストは見られないので、どこでもよい。 */
export async function loadFontFromAssets(assets: Fetcher): Promise<Uint8Array> {
	const res = await assets.fetch(new URL(OG_FONT_PATH, 'https://assets.local'));
	if (!res.ok) throw new Error(`共有の画像のフォントを読めませんでした: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}
