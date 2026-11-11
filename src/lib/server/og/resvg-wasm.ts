/**
 * resvg の wasm の受け渡し。
 *
 * wasm は `src/worker.js` が import する（wrangler が .wasm をコンパイル済みの `WebAssembly.Module` にする。
 * SvelteKit（Vite）の側では .wasm を import できない）。adapter-cloudflare 7 までは env に足して
 * `platform.env.RESVG_WASM` で渡せたが、8 は env を `cloudflare:workers` から取るので worker.js の
 * `{ ...env, RESVG_WASM }` は SvelteKit に届かない。そこで `globalThis` の決まった名前を介して渡す。
 *
 * 同じ isolate の中で、worker.js が起動時に1度入れ、og.png のルートがリクエストごとに読む。
 * 入っていない（vite dev など）と `undefined`。依存を持たないのは、worker.js から import しても
 * 画像を描く resvg の JS を二重に束ねないため。
 */
const KEY = '__UMA_MEMO_RESVG_WASM__';

export function provideResvgWasm(wasm: WebAssembly.Module): void {
	(globalThis as Record<string, unknown>)[KEY] = wasm;
}

export function resvgWasm(): WebAssembly.Module | undefined {
	return (globalThis as Record<string, unknown>)[KEY] as WebAssembly.Module | undefined;
}
