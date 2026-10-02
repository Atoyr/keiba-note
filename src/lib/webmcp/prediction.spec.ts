import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildPredictionContext,
	registerPredictionTools,
	type PredictionPageData
} from './prediction';
import type { ModelContextTool } from './support';

afterEach(() => vi.unstubAllGlobals());
const data: PredictionPageData = {
	race: {
		id: 'r1',
		name: null,
		date: '2099-05-05',
		course: '京都',
		surface: '芝',
		distance: 2200,
		trackCondition: null,
		weather: null
	},
	oddsAsOf: null,
	myRaceNote: null,
	myFlow: null,
	sameCondition: [],
	rows: [
		{
			entryId: 'e1',
			horseId: 'h1',
			horseNumber: null,
			horseName: 'ホースA',
			jockey: null,
			odds: null,
			popularity: null,
			myPreview: null,
			history: [{ body: '過去メモ' }],
			pastRuns: [{ date: '2026-01-01' }]
		}
	]
};

function setup() {
	const tools: ModelContextTool[] = [];
	const signals: AbortSignal[] = [];
	vi.stubGlobal('document', {
		modelContext: {
			registerTool: vi.fn(async (tool: ModelContextTool, options: { signal: AbortSignal }) => {
				tools.push(tool);
				signals.push(options.signal);
			})
		}
	});
	const applyFields = vi.fn(async () => {});
	const onApplied = vi.fn();
	let current = true;
	const cleanup = registerPredictionTools({
		getData: () => data,
		getFields: () => ({}),
		applyFields,
		onApplied,
		isCurrent: () => current
	});
	return {
		tools,
		signals,
		applyFields,
		onApplied,
		cleanup,
		leave: () => {
			current = false;
		}
	};
}

describe('予想 WebMCP', () => {
	it('出馬表前・オッズ未取得も読め、無い値は null にする', () => {
		const context = buildPredictionContext(data);
		expect(context.entries[0]).toMatchObject({
			entryId: 'e1',
			horseNumber: null,
			odds: null,
			myCurrentPrediction: null,
			myHistory: data.rows[0].history,
			pastRuns: data.rows[0].pastRuns
		});
		expect(context.oddsAsOf).toBeNull();
		expect(buildPredictionContext({ ...data, rows: [] }).entries).toEqual([]);
	});

	it('read-only と未保存変更のヒント、JSON Schema を既存制約で公開する', () => {
		const { tools } = setup();
		expect(tools.map((tool) => tool.name)).toEqual([
			'get_prediction_context',
			'apply_prediction_draft'
		]);
		expect(tools[0].annotations).toEqual({
			readOnlyHint: true,
			consequentialHint: false,
			untrustedContentHint: true
		});
		expect(tools[1].annotations.consequentialHint).toBe(false);
		const schema = tools[1].inputSchema as {
			properties: {
				race: { properties: { body: { maxLength: number } } };
				entries: { items: { properties: { mark: { anyOf: { enum?: string[] }[] } } } };
			};
		};
		expect(schema.properties.race.properties.body.maxLength).toBe(10000);
		expect(JSON.stringify(schema.properties.entries.items.properties.mark)).toContain('◎');
	});

	it('不正入力はコールバックに届かず、成功だけを未保存として知らせる', async () => {
		const { tools, applyFields, onApplied } = setup();
		expect(await tools[1].execute({ entries: [{ entryId: 'other' }] })).toMatchObject({
			status: 'rejected',
			reason: 'unknown_entry'
		});
		expect(applyFields).not.toHaveBeenCalled();
		expect(onApplied).not.toHaveBeenCalled();
		expect(await tools[1].execute({ entries: [{ entryId: 'e1', mark: '◎' }] })).toEqual({
			status: 'applied',
			saved: false
		});
		expect(applyFields).toHaveBeenCalledWith({ 'mark.e1': ['◎'] });
		expect(onApplied).toHaveBeenCalledOnce();
	});

	it('解除後や別レースの古いコールバックと、キャンセル済み実行を拒否する', async () => {
		const { tools, signals, cleanup, leave, applyFields } = setup();
		const aborted = new AbortController();
		aborted.abort();
		expect(await tools[1].execute({ entries: [] }, { signal: aborted.signal })).toMatchObject({
			reason: 'inactive_page'
		});
		leave();
		expect(await tools[0].execute({})).toMatchObject({ reason: 'inactive_page' });
		cleanup();
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		expect(await tools[1].execute({ entries: [] })).toMatchObject({ reason: 'inactive_page' });
		expect(applyFields).not.toHaveBeenCalled();
	});

	it('非対応・フォーム未準備・登録失敗は通常の画面にエラーを投げない', async () => {
		const options = {
			getData: () => data,
			getFields: () => null,
			applyFields: vi.fn(async () => {}),
			onApplied: vi.fn(),
			isCurrent: () => true
		};
		vi.stubGlobal('document', {});
		expect(registerPredictionTools(options)).toBeTypeOf('function');
		const tools: ModelContextTool[] = [];
		vi.stubGlobal('document', {
			modelContext: {
				registerTool: async (tool: ModelContextTool) => {
					tools.push(tool);
				}
			}
		});
		const cleanup = registerPredictionTools(options);
		expect(await tools[1].execute({ entries: [] })).toMatchObject({ reason: 'form_unavailable' });
		cleanup();
		vi.stubGlobal('document', {
			modelContext: {
				registerTool: async () => {
					throw new Error('not allowed');
				}
			}
		});
		expect(() => registerPredictionTools(options)).not.toThrow();
		await Promise.resolve();
		vi.stubGlobal('document', {
			modelContext: {
				registerTool: () => {
					throw new Error('unsupported');
				}
			}
		});
		expect(() => registerPredictionTools(options)).not.toThrow();
	});
});
