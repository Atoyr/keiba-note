import type { Page } from '@playwright/test';

export type DeviceShareMode = 'success' | 'cancel' | 'retry' | 'copy' | 'manual';

/** OSの共有画面自体は自動操作できないため、ブラウザとの境界で受け渡す値を記録する。 */
export async function mockDeviceShare(page: Page, mode: DeviceShareMode) {
	await page.evaluate((mode) => {
		const state = { shared: [] as ShareData[], copied: [] as string[] };
		Object.defineProperty(window, 'deviceShareState', { configurable: true, value: state });
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value:
				mode === 'copy' || mode === 'manual'
					? undefined
					: async (data: ShareData) => {
							state.shared.push(data);
							if (mode === 'cancel') throw new DOMException('cancelled', 'AbortError');
							if (mode === 'retry' && state.shared.length === 1)
								throw new DOMException('expired', 'NotAllowedError');
						}
		});
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (url: string) => {
					if (mode === 'manual') throw new DOMException('denied', 'NotAllowedError');
					state.copied.push(url);
				}
			}
		});
	}, mode);
}

export async function deviceShareState(page: Page) {
	return page.evaluate(
		() =>
			(window as unknown as { deviceShareState: { shared: ShareData[]; copied: string[] } })
				.deviceShareState
	);
}
