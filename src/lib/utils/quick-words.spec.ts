import { describe, expect, it } from 'vitest';
import { NOTE_BODY_MAX } from '$lib/schemas/note';
import { hasQuickWord, toggleQuickWord } from './quick-words';

describe('hasQuickWord', () => {
	it('区切りで分けたかたまりが同じときだけ入っているとみなす', () => {
		expect(hasQuickWord('', '前が壁')).toBe(false);
		expect(hasQuickWord('前が壁', '前が壁')).toBe(true);
		expect(hasQuickWord('伸びた。前が壁、出遅れ', '出遅れ')).toBe(true);
		expect(hasQuickWord('前が壁になった', '前が壁')).toBe(false);
		expect(hasQuickWord('a\n 前が壁 \nb', '前が壁')).toBe(true);
	});
});

describe('toggleQuickWord 足す', () => {
	it('空（空白だけ）なら言葉だけ', () => {
		expect(toggleQuickWord('', '前が壁')).toBe('前が壁');
		expect(toggleQuickWord('  \n', '前が壁')).toBe('前が壁');
	});
	it('2語目は 、 で続ける', () => {
		expect(toggleQuickWord('前が壁', '出遅れ')).toBe('前が壁、出遅れ');
		expect(toggleQuickWord('前が壁 ', '出遅れ')).toBe('前が壁、出遅れ');
	});
	it('。や改行の後はそのまま続ける', () => {
		expect(toggleQuickWord('伸びた。', '前が壁')).toBe('伸びた。前が壁');
		expect(toggleQuickWord('伸びた！', '前が壁')).toBe('伸びた！前が壁');
		expect(toggleQuickWord('伸びた\n', '前が壁')).toBe('伸びた\n前が壁');
	});
	it('文中の同じ字は数えず、足す', () => {
		expect(toggleQuickWord('前が壁になった', '前が壁')).toBe('前が壁になった、前が壁');
	});
	it('上限を超えるなら null', () => {
		expect(toggleQuickWord('あ'.repeat(NOTE_BODY_MAX - 3), '前が壁')).toBeNull();
		expect(toggleQuickWord('あ'.repeat(NOTE_BODY_MAX - 4), '前が壁')).not.toBeNull();
	});
});

describe('toggleQuickWord 抜く', () => {
	it('先頭・中・末尾・唯一', () => {
		expect(toggleQuickWord('前が壁、出遅れ、前残り', '前が壁')).toBe('出遅れ、前残り');
		expect(toggleQuickWord('前が壁、出遅れ、前残り', '出遅れ')).toBe('前が壁、前残り');
		expect(toggleQuickWord('前が壁、出遅れ、前残り', '前残り')).toBe('前が壁、出遅れ');
		expect(toggleQuickWord('前が壁', '前が壁')).toBe('');
	});
	it('人が書いた改行・文は壊さず、末尾の空白だけ落とす', () => {
		expect(toggleQuickWord('伸びた。前が壁', '前が壁')).toBe('伸びた。');
		expect(toggleQuickWord('一行目\n前が壁\n三行目', '前が壁')).toBe('一行目\n\n三行目');
	});
	it('足して抜くと元に戻る（、 区切り）', () => {
		let body = '前が壁';
		body = toggleQuickWord(body, '出遅れ')!;
		body = toggleQuickWord(body, '前残り')!;
		expect(body).toBe('前が壁、出遅れ、前残り');
		body = toggleQuickWord(body, '前残り')!;
		body = toggleQuickWord(body, '出遅れ')!;
		expect(body).toBe('前が壁');
		expect(toggleQuickWord(toggleQuickWord('伸びた。', '前が壁')!, '前が壁')).toBe('伸びた。');
	});
});
