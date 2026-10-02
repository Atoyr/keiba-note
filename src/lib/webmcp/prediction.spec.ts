import { describe, expect, it, vi } from 'vitest';
import { emptyFlow } from '$lib/schemas/race-flow';
import { registerPredictionTools } from './prediction';
import type { ModelContextTool } from './support';

async function setup(fail = false) {
	const tools = new Map<string, ModelContextTool>();
	const applyFields = vi.fn(async () => {});
	const onApplied = vi.fn();
	const getContext = vi.fn();
	const doc = {
		modelContext: {
			registerTool: vi.fn(async (tool: ModelContextTool, { signal }: { signal: AbortSignal }) => {
				if (fail && tool.name === 'apply_prediction_draft') throw new Error('unavailable');
				tools.set(tool.name, tool);
				signal.addEventListener('abort', () => tools.delete(tool.name));
			})
		}
	} as unknown as Document;
	const dispose = registerPredictionTools({
		document: doc,
		getContext,
		entryIds: new Set(['e1']),
		applyFields,
		isReady: () => true,
		onApplied
	});
	await Promise.resolve();
	await Promise.resolve();
	const execute = (input: unknown, signal = new AbortController().signal) =>
		tools.get('apply_prediction_draft')!.execute(input, { signal });
	return { tools, execute, dispose, applyFields, onApplied, getContext };
}

describe('prediction tools', () => {
	it('非対応環境は何もしない', () => {
		const applyFields = vi.fn();
		registerPredictionTools({
			document: {} as Document,
			getContext: vi.fn(),
			entryIds: new Set(),
			applyFields,
			isReady: () => true,
			onApplied: vi.fn()
		})();
		expect(applyFields).not.toHaveBeenCalled();
	});
	it('read-onlyの意味付けと取得を登録する', async () => {
		const { tools, getContext, dispose } = await setup();
		getContext.mockReturnValue({ race: { id: 'r1' } });
		expect(tools.get('get_prediction_context')!.annotations).toEqual({
			readOnlyHint: true,
			consequentialHint: false,
			untrustedContentHint: true
		});
		expect(
			await tools
				.get('get_prediction_context')!
				.execute({}, { signal: new AbortController().signal })
		).toEqual({ race: { id: 'r1' } });
		dispose();
	});
	it('部分更新だけを渡し、保存なしの成功を返す', async () => {
		const { execute, applyFields, onApplied, tools, dispose } = await setup();
		expect(await execute({ entries: [{ entryId: 'e1', mark: '◎' }] })).toEqual({
			status: 'applied',
			saved: false
		});
		expect(applyFields).toHaveBeenCalledWith({ 'mark.e1': ['◎'] });
		expect(onApplied).toHaveBeenCalledOnce();
		expect(tools.get('apply_prediction_draft')!.inputSchema).toMatchObject({
			type: 'object',
			required: ['entries'],
			additionalProperties: false
		});
		dispose();
	});
	it('未知ID・不正入力・ペースの矛盾は一括拒否する', async () => {
		const { execute, applyFields, dispose } = await setup();
		expect(
			await execute({ race: { body: '適用しない' }, entries: [{ entryId: 'other' }] })
		).toMatchObject({ reason: 'unknown_entry', entryId: 'other' });
		expect(
			await execute({
				race: {
					flow: { ...emptyFlow(), finish: { spots: [{ entryId: 'other', x: 0, y: 0 }], memo: '' } }
				},
				entries: []
			})
		).toMatchObject({ reason: 'unknown_entry' });
		expect(await execute({ entries: [{ entryId: 'e1', mark: '?' }] })).toMatchObject({
			reason: 'invalid_input'
		});
		expect(await execute({ race: { pace: 'ハイ', flow: emptyFlow() }, entries: [] })).toMatchObject(
			{ reason: 'conflicting_pace' }
		);
		expect(applyFields).not.toHaveBeenCalled();
		dispose();
	});
	it('abortで両toolを解除し、保持された古いcallbackも拒否する', async () => {
		const { tools, applyFields, dispose } = await setup();
		const old = tools.get('apply_prediction_draft')!;
		dispose();
		expect(tools.size).toBe(0);
		expect(
			await old.execute({ entries: [] }, { signal: new AbortController().signal })
		).toMatchObject({ reason: 'inactive_page' });
		expect(applyFields).not.toHaveBeenCalled();
	});
	it('呼び出し中断・登録失敗を通常フォームへ波及させない', async () => {
		const { execute, applyFields, dispose } = await setup();
		const controller = new AbortController();
		controller.abort();
		expect(await execute({ entries: [] }, controller.signal)).toMatchObject({
			reason: 'inactive_page'
		});
		expect(applyFields).not.toHaveBeenCalled();
		dispose();
		const failed = await setup(true);
		expect(failed.tools.size).toBe(0);
	});
});
