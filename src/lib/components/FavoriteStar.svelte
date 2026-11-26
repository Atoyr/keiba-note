<script lang="ts">
	import Star from '@lucide/svelte/icons/star';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Button } from '#lib/components/ui/button/index.ts';

	/**
	 * 推しの星のボタン（送信ボタン。form は呼ぶ側が持つ）。
	 *
	 * **星だけのボタン**（文字を添えない）。今の状態は星の塗り（推しなら★、そうでなければ☆）で、
	 * 押すと何が起きるかは読み上げと hover の名前（`aria-label` / `title`）で出す。色は `--favorite`（輪郭）と
	 * `--favorite-fill`（塗り）のトークン（design-system.md 第7章）。
	 * 一覧のように同じ名前のボタンが行ごとに並ぶときは `horseName` を渡し、どの馬の星かを名前に入れる。
	 */
	let {
		favorite,
		pending = false,
		horseName,
		size = 'md',
		class: className = '',
		...rest
	}: {
		/** 今、推しか。 */
		favorite: boolean;
		/** 送信中。`aria-disabled` にして見た目を薄くする（二重送信は呼ぶ側の `enhance` が止める）。 */
		pending?: boolean;
		horseName?: string;
		/** `md` は星 size-5（一覧）、`lg` は size-7（馬の画面）。ボタンはどちらも同じ大きさ。 */
		size?: 'md' | 'lg';
	} & Omit<HTMLButtonAttributes, 'type' | 'children'> = $props();

	const label = $derived(
		favorite
			? horseName
				? `${horseName}を推しから外す`
				: '推しから外す'
			: horseName
				? `${horseName}を推しにする`
				: '推しにする'
	);
</script>

<Button
	type="submit"
	variant="ghost"
	size="icon-lg"
	aria-label={label}
	title={label}
	aria-disabled={pending}
	class="aria-disabled:opacity-50 {className}"
	{...rest as Record<string, unknown>}
>
	<Star
		class="text-favorite {size === 'lg' ? 'size-7' : 'size-5'} {favorite
			? 'fill-favorite-fill'
			: ''}"
		aria-hidden="true"
	/>
</Button>
