/** 2026-09-30 WebMCP draft の使用部分だけ。実験的な DOM 型をアプリ全体へ拡張しない。 */
export type ModelContextTool = {
	name: string;
	description: string;
	inputSchema: object;
	annotations: {
		readOnlyHint: boolean;
		consequentialHint: boolean;
		untrustedContentHint: boolean;
	};
	execute: (input: unknown, options?: { signal: AbortSignal }) => Promise<unknown>;
};

export type ModelContext = {
	registerTool: (tool: ModelContextTool, options: { signal: AbortSignal }) => Promise<void>;
};

export function getModelContext(): ModelContext | null {
	if (typeof document === 'undefined') return null;
	const context = (document as Document & { modelContext?: ModelContext }).modelContext;
	return context && typeof context.registerTool === 'function' ? context : null;
}
