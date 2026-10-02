import type { Page } from '@playwright/test';
import type { ModelContextTool } from '../src/lib/webmcp/support';

declare global {
	interface Window {
		__predictionTools: Map<string, ModelContextTool>;
		__retiredPredictionTools: ModelContextTool[];
	}
}

/** 実験フラグに依存せず、現行 registerTool / AbortSignal 境界だけをモックする。 */
export async function mockPredictionTools(page: Page) {
	await page.addInitScript(() => {
		window.__predictionTools = new Map();
		window.__retiredPredictionTools = [];
		Object.defineProperty(document, 'modelContext', {
			configurable: true,
			value: {
				async registerTool(tool: ModelContextTool, options: { signal: AbortSignal }) {
					if (options.signal.aborted) return;
					if (window.__predictionTools.has(tool.name)) throw new Error('duplicate_tool');
					window.__predictionTools.set(tool.name, tool);
					options.signal.addEventListener(
						'abort',
						() => {
							if (window.__predictionTools.get(tool.name) === tool) {
								window.__predictionTools.delete(tool.name);
								window.__retiredPredictionTools.push(tool);
							}
						},
						{ once: true }
					);
				}
			}
		});
	});
}

export async function applyPrediction(page: Page, input: unknown) {
	return page.evaluate(
		async (input) => window.__predictionTools.get('apply_prediction_draft')!.execute(input),
		input
	);
}
