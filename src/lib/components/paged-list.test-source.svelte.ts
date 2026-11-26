/**
 * `paged-list.svelte.spec.ts` が使う、差し替えられる1ページ目（`load` の読み直しの代わり）。
 * runes は `.svelte.ts` の中でしか使えないので、spec から切り出している。
 */
export function mutableSource<T>(initial: T): { get: () => T; set: (value: T) => void } {
	let value = $state.raw(initial);
	return {
		get: () => value,
		set: (next) => {
			value = next;
		}
	};
}
