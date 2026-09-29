import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { raceSummaryCardSvg } from '$lib/utils/share-card';
import { OG_FONT_PATH, renderPng } from './render';

const assets = async () => ({
	wasm: new WebAssembly.Module(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm')),
	loadFont: vi.fn(async () => new Uint8Array(await readFile(`static${OG_FONT_PATH}`)))
});

it('予想まとめのカードを 1200×630 の PNG にし、フォントは1度だけ読む', async () => {
	const svg = raceSummaryCardSvg(
		{
			race: { name: '天皇賞（秋）', meeting: '東京11R', spec: '2026-11-01', grade: 'G1' },
			body: '',
			rows: [
				{ horseName: 'ドウデュース', horseNumber: 7, bracket: 4, body: '', mark: '◎', tags: [] }
			]
		},
		'週末うまメモ'
	);
	const a = await assets();
	const first = await renderPng(svg, a);
	const second = await renderPng(svg, a);
	const header = new DataView(first.buffer, first.byteOffset);
	// PNG の署名と、IHDR の幅・高さ。
	expect([...first.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	expect([header.getUint32(16), header.getUint32(20)]).toEqual([1200, 630]);
	expect(second).toEqual(first);
	expect(a.loadFont).toHaveBeenCalledTimes(1);
});
