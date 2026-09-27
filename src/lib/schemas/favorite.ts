import * as v from 'valibot';

/**
 * 推しにする（`1`）・外す（`0`）。押したボタンが次の状態を送る。
 * 「今と逆にする」にしないのは、二重送信や別のタブからの送信で状態が行き来しないように。
 */
export const favoriteHorseSchema = v.object({
	favorite: v.pipe(
		v.picklist(['1', '0']),
		v.transform((s) => s === '1')
	)
});
