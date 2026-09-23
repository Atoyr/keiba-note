/**
 * プライバシーポリシーと利用規約に共通して出す値。
 *
 * どちらも Google OAuth の同意画面に URL を登録する公開ページ（docs/operations.md）。
 * 問い合わせ先の GitHub Issues は各ページに直に書いている（外部リンクを変数で渡すと
 * `svelte/no-navigation-without-resolve` が内部リンクと見分けられないため）。
 * 窓口を Issues にしているのは、運営者のメールアドレスを公開しないため。
 */
export const LEGAL = {
	operator: 'UCHIYAMA Ryota'
} as const;
