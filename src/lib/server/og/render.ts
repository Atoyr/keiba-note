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
 *
 * 初期化は Promise を共有する（同時に2つ走らせると resvg の中の状態が壊れる）。コンパイル済みの
 * Module から作るだけで通信を待たないので、途中で止まったまま残ることはない。
 * フォントは読み終えた値だけを持つ。読み込み中の Promise を共有すると、最初のリクエストが途中で
 * 打ち切られたとき、その Promise が決着しないまま残り、後のリクエストまで待たせうる。
 * 同時に来たリクエストがそれぞれ読むことはあるが、Static Assets からなので害は無い。
 */
export type OgAssets = {
	wasm: WebAssembly.Module;
	loadFont: () => Promise<Uint8Array>;
};

let ready: Promise<void> | undefined;
let fontBuffer: Uint8Array | undefined;

export async function renderPng(svg: string, assets: OgAssets): Promise<Uint8Array<ArrayBuffer>> {
	ready ??= initWasm(assets.wasm).catch((e) => {
		ready = undefined;
		throw e;
	});
	const [, font] = await Promise.all([ready, fontBuffer ?? assets.loadFont()]);
	fontBuffer ??= font;
	const resvg = new Resvg(svg, {
		font: { fontBuffers: [font], defaultFontFamily: CARD_FONT }
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
