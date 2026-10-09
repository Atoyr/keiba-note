<script lang="ts">
	import { resolve } from '$app/paths';
	import { gradedRaceParam } from '$lib/utils/graded-race';
	import { cn } from '$lib/utils';

	/**
	 * 重賞ごとの傾向のメモ（`/graded-races/[name]` で書くもの）を、予想画面とふりかえり画面に**読むだけで**出す。
	 * このレースのメモではなく、毎年共通の重賞のメモだと見出しで分かるようにする。
	 * 空色（sky。結果を見る前の見立て）にも amber（注意）にも寄せず、重賞の画面の傾向の枠と同じ白地にする。
	 * 直すのは重賞の画面（リンク）。傾向が無いときは呼び出し側が出さない。
	 */
	let {
		raceKey,
		body,
		class: className
	}: {
		/** `gradedRaceKey` で寄せた重賞の名前。 */
		raceKey: string;
		body: string;
		class?: string;
	} = $props();

	const id = $props.id();
</script>

<section aria-labelledby={id} class={cn('rounded-md border p-3', className)}>
	<h2 {id} class="text-sm font-semibold text-muted-foreground">
		重賞の傾向
		<span class="font-normal">{raceKey}・毎年共通</span>
	</h2>
	<!-- 本文の改行は whitespace-pre-wrap で保つ（要素の前後の空白は Svelte が落とす）。 -->
	<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
		{body}
	</p>
	<a
		href={resolve('/graded-races/[name]', { name: gradedRaceParam(raceKey) })}
		class="mt-1 inline-flex min-h-6 items-center text-xs text-muted-foreground underline-offset-2 hover:underline"
	>
		重賞の画面で直す
	</a>
</section>
