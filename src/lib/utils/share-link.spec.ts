import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareLink } from './share-link';

const data = { title: 'テスト賞 予想まとめ', url: 'https://example.invalid/shared/races/test' };
afterEach(() => vi.unstubAllGlobals());

describe('端末へのリンク共有', () => {
	it('対応端末へタイトルと公開URLを渡す', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { share });
		expect(await shareLink(data)).toBe('shared');
		expect(share).toHaveBeenCalledWith(data);
	});
	it('キャンセル時はコピーに切り替えない', async () => {
		const writeText = vi.fn();
		vi.stubGlobal('navigator', {
			share: vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError')),
			clipboard: { writeText }
		});
		expect(await shareLink(data)).toBe('cancelled');
		expect(writeText).not.toHaveBeenCalled();
	});
	it('ユーザー操作の有効期限切れなどは再試行を案内する', async () => {
		vi.stubGlobal('navigator', {
			share: vi.fn().mockRejectedValue(new DOMException('expired', 'NotAllowedError'))
		});
		expect(await shareLink(data)).toBe('retry');
	});
	it('非対応端末ではリンクをコピーする', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		expect(await shareLink(data)).toBe('copied');
		expect(writeText).toHaveBeenCalledWith(data.url);
	});
	it('コピーもできなければリンク欄からの手動コピーを案内する', async () => {
		vi.stubGlobal('navigator', {});
		expect(await shareLink(data)).toBe('manual');
	});
});
