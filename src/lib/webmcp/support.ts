/** 現行 WebMCP draft の必要な部分だけ。ブラウザの実験的な型をアプリ全体へ漏らさない。 */
export type ModelContextTool = {
	name: string;
	description: string;
	inputSchema: object;
	annotations: {
		readOnlyHint: boolean;
		consequentialHint: boolean;
		untrustedContentHint: boolean;
	};
	execute: (input: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
};

export type ModelContext = {
	registerTool: (tool: ModelContextTool, options: { signal: AbortSignal }) => Promise<void>;
};

export function predictionModelContext(doc: Document): ModelContext | null {
	const context = (doc as Document & { modelContext?: ModelContext }).modelContext;
	return context && typeof context.registerTool === 'function' ? context : null;
}
