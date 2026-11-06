import { describe, expect, it } from 'vitest';
import { QuickSaver } from './quick-save.svelte';

/** send を手で解決できるようにする。 */
function setup() {
	const sent: { entryId: string; body: string; resolve: (ok: boolean) => void }[] = [];
	const saved: [string, string][] = [];
	const saver = new QuickSaver({
		send: (entryId, body) =>
			new Promise<boolean>((resolve) => sent.push({ entryId, body, resolve })),
		onSaved: (entryId, body) => saved.push([entryId, body])
	});
	return { saver, sent, saved };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('QuickSaver', () => {
	it('連打しても送るのは1本目と最後の値だけで、onSaved は送った値で順に呼ぶ', async () => {
		const { saver, sent, saved } = setup();
		saver.save('a', '1');
		saver.save('a', '2');
		saver.save('a', '3');
		expect(sent.map((s) => s.body)).toEqual(['1']);
		expect(saver.status.a).toBe('saving');
		sent[0].resolve(true);
		await flush();
		expect(sent.map((s) => s.body)).toEqual(['1', '3']);
		expect(saver.status.a).toBe('saving');
		expect(saver.busy).toBe(true);
		sent[1].resolve(true);
		await flush();
		expect(saved).toEqual([
			['a', '1'],
			['a', '3']
		]);
		expect(saver.status.a).toBe('saved');
		expect(saver.busy).toBe(false);
	});

	it('失敗は error になり、同じ馬へ save し直して saved になる', async () => {
		const { saver, sent, saved } = setup();
		saver.save('a', 'x');
		sent[0].resolve(false);
		await flush();
		expect(saver.status.a).toBe('error');
		expect(saver.failed).toBe(1);
		expect(saved).toEqual([]);
		saver.save('a', 'x');
		expect(saver.status.a).toBe('saving');
		expect(sent[1]).toMatchObject({ entryId: 'a', body: 'x' });
		sent[1].resolve(true);
		await flush();
		expect(saver.status.a).toBe('saved');
		expect(saver.failed).toBe(0);
		expect(saved).toEqual([['a', 'x']]);
	});

	it('送信中に失敗しても、控えがあれば続けて送る', async () => {
		const { saver, sent, saved } = setup();
		saver.save('a', '1');
		saver.save('a', '2');
		sent[0].resolve(false);
		await flush();
		expect(sent.map((s) => s.body)).toEqual(['1', '2']);
		expect(saver.status.a).toBe('saving');
		sent[1].resolve(true);
		await flush();
		expect(saved).toEqual([['a', '2']]);
		expect(saver.status.a).toBe('saved');
	});

	it('別の馬は並行して送る', async () => {
		const { saver, sent } = setup();
		saver.save('a', '1');
		saver.save('b', '2');
		expect(sent.map((s) => s.entryId)).toEqual(['a', 'b']);
	});

	it('send が投げても error になる', async () => {
		const saver = new QuickSaver({
			send: () => Promise.reject(new Error('offline')),
			onSaved: () => {}
		});
		saver.save('a', '1');
		await flush();
		expect(saver.status.a).toBe('error');
	});

	it('reset で表示を空にし、送信中の結果は表示にも onSaved にも反映しない', async () => {
		const { saver, sent, saved } = setup();
		saver.save('a', '1');
		saver.reset();
		expect(saver.status).toEqual({});
		sent[0].resolve(true);
		await flush();
		expect(saved).toEqual([]);
		expect(saver.status).toEqual({});
	});
});
