/**
 * 画面に管理機能の導線を出してよい相手か。
 *
 * マスタ（レース・出走馬・馬）の書き換えは admin だけ（design.md 第4章）。
 * **操作を弾くのはサーバー側の `ctxAdmin` の仕事**で、ここはその手前の
 * 「見せない」ための判定。一般ユーザーに残す導線はメモを書くものだけにする。
 *
 * `$lib/server/auth/session` の `SessionUser` は server 限定なので型は使えない。
 * 必要なのは role だけなので構造だけ受ける。
 */
export function isAdmin(user: { role: string } | null | undefined): boolean {
	return user?.role === 'admin';
}
