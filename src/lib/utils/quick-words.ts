import { NOTE_BODY_MAX } from '$lib/schemas/note';

/**
 * クイック入力の言葉を、ふりかえりメモの本文に出し入れする（純粋な関数）。
 *
 * 本文は人が書く文なので、`、`・`。`・`，`・`,`・改行で区切ったかたまりが言葉と同じときだけ「入っている」とみなす
 * （「前が壁になった」の中の「前が壁」は数えない）。
 */
const DELIMITERS = '、。，,\n';

/** 区切りで分けたかたまり。前後の空白を除いた範囲（元の文字列の位置）を持つ。空は飛ばす。 */
function chunks(body: string): { text: string; start: number; end: number }[] {
	const out: { text: string; start: number; end: number }[] = [];
	let from = 0;
	const push = (to: number) => {
		let start = from;
		let end = to;
		while (start < end && /\s/.test(body[start])) start++;
		while (end > start && /\s/.test(body[end - 1])) end--;
		if (end > start) out.push({ text: body.slice(start, end), start, end });
	};
	for (let i = 0; i < body.length; i++) {
		if (DELIMITERS.includes(body[i])) {
			push(i);
			from = i + 1;
		}
	}
	push(body.length);
	return out;
}

/** 本文にその言葉が入っているか。 */
export function hasQuickWord(body: string, word: string): boolean {
	return chunks(body).some((c) => c.text === word);
}

/**
 * 言葉を入れる（入っていなければ足す・入っていれば抜く）。結果の本文を返す。
 * 上限（`NOTE_BODY_MAX`）を超えるなら null。
 */
export function toggleQuickWord(body: string, word: string): string | null {
	const found = chunks(body).find((c) => c.text === word);
	if (found) {
		let from = found.start;
		let to = found.end;
		if (body[to] === '、') to += 1;
		else if (body[from - 1] === '、') from -= 1;
		return (body.slice(0, from) + body.slice(to)).trimEnd();
	}
	let next: string;
	if (body.trim() === '') next = word;
	else if (/\n\s*$/.test(body)) next = body + word;
	else {
		const head = body.trimEnd();
		const last = head[head.length - 1];
		next = head + ('。！？!?、'.includes(last) ? '' : '、') + word;
	}
	return next.length > NOTE_BODY_MAX ? null : next;
}
