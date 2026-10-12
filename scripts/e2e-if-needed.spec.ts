import { describe, expect, it } from 'vitest';
import { isDocsOnly } from './e2e-if-needed.ts';

describe('isDocsOnly（文書だけの変更なら verify は E2E を飛ばす）', () => {
	it('空なら false（回す側に倒す）', () => {
		expect(isDocsOnly([])).toBe(false);
	});

	it('docs/ と *.md だけなら true', () => {
		expect(isDocsOnly(['docs/testing.md'])).toBe(true);
		expect(isDocsOnly(['AGENTS.md', '.claude/agents/implementer.md'])).toBe(true);
	});

	it('docs/ の下は拡張子を問わない', () => {
		expect(isDocsOnly(['docs/x.png'])).toBe(true);
	});

	it('1つでも文書でなければ false', () => {
		expect(isDocsOnly(['docs/testing.md', 'src/a.ts'])).toBe(false);
		expect(isDocsOnly(['.claude/settings.json'])).toBe(false);
	});

	it('data/ は手元では飛ばさない', () => {
		expect(isDocsOnly(['data/races/x.yaml'])).toBe(false);
	});
});
