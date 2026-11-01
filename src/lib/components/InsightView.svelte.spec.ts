import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import InsightView from './InsightView.svelte';

describe('InsightView', () => {
	it('言葉もメモも無ければ何も描かない', () => {
		const screen = render(InsightView, { words: [], memo: '  ' });

		expect(screen.container.querySelector('.insight-view')).toBeNull();
	});

	it('札と言葉とメモを出し、未保存の言葉だけ破線にする', () => {
		const screen = render(InsightView, {
			words: [{ word: '内詰まり' }, { word: '前が壁', unsaved: true }],
			memo: '2400 なら。'
		});

		const badges = [...screen.container.querySelectorAll('[data-slot="badge"]')];
		expect(badges.map((b) => b.textContent?.trim())).toEqual(['気づき', '内詰まり', '前が壁']);
		expect(badges[1].className).not.toContain('border-dashed');
		expect(badges[2].className).toContain('border-dashed');
		expect(screen.container.textContent).toContain('2400 なら。');
	});

	it('clamp のときだけメモを 3 行で切り、label=false なら札を置かない', () => {
		const clamped = render(InsightView, { words: [], memo: 'メモ', clamp: true, label: false });
		expect(clamped.container.querySelector('.line-clamp-3')).not.toBeNull();
		expect(clamped.container.querySelector('[data-slot="badge"]')).toBeNull();

		const full = render(InsightView, { words: [], memo: 'メモ' });
		expect(full.container.querySelector('.line-clamp-3')).toBeNull();
	});
});
