import { expect, type Page } from '@playwright/test';
import type { PredictionDraft } from '../src/lib/schemas/prediction-draft';
import type { PredictionContext } from '../src/lib/webmcp/prediction';
import type { ModelContextTool } from '../src/lib/webmcp/support';

type ToolWindow = Window & {
	predictionTools: Map<string, ModelContextTool>;
	previousPredictionTool?: ModelContextTool;
};

/** 実験フラグに依存せず、現行の登録と AbortSignal の境界を差し替える。アプリ側に試験用の口は足さない。 */
export async function mockPredictionTools(page: Page) {
	await page.addInitScript(() => {
		const tools = new Map<string, ModelContextTool>();
		(window as ToolWindow).predictionTools = tools;
		Object.defineProperty(document, 'modelContext', {
			configurable: true,
			value: {
				registerTool: async (tool: ModelContextTool, { signal }: { signal: AbortSignal }) => {
					if (signal.aborted) return;
					tools.set(tool.name, tool);
					signal.addEventListener('abort', () => {
						if (tools.get(tool.name) === tool) tools.delete(tool.name);
					});
				}
			}
		});
	});
}

export async function predictionContext(page: Page): Promise<PredictionContext> {
	await expect
		.poll(() =>
			page.evaluate(() => (window as ToolWindow).predictionTools.has('apply_prediction_draft'))
		)
		.toBe(true);
	return page.evaluate(async () => {
		const tools = (window as ToolWindow).predictionTools;
		return (await tools
			.get('get_prediction_context')!
			.execute({}, { signal: new AbortController().signal })) as PredictionContext;
	});
}

export async function applyPrediction(page: Page, draft: PredictionDraft | unknown) {
	return page.evaluate(async (input) => {
		return (window as ToolWindow).predictionTools
			.get('apply_prediction_draft')!
			.execute(input, { signal: new AbortController().signal });
	}, draft);
}

/** キャプチャ用。専用seedの予想画面に未保存状態だけ作る。 */
export async function preparePredictionDraft(page: Page) {
	await mockPredictionTools(page);
	await page.reload();
	const context = await predictionContext(page);
	const entryId = context.entries[0].entryId;
	await applyPrediction(page, {
		race: { body: '前半から流れそう。差し中心。', pace: 'ハイ' },
		entries: [
			{ entryId, body: '前走不利。コース替わりで狙う。', mark: '◎', tags: ['次走買い', '不利'] }
		]
	});
	await page.getByText('書き直す', { exact: true }).click();
	await page.getByText('展開の予想', { exact: true }).click();
	await expect(page.getByText('未保存の変更が 2 件あります')).toBeVisible();
	// 一時toastは通常画面の入力・未保存表示を隠すため、閉じてから撮る。
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10000 });
}
