<script lang="ts">
	/**
	 * 共有中であることを示す札。
	 *
	 * **既定が非公開になったので、目印を付けるべきは例外のほう。**
	 * 以前は private に鍵アイコンを出していたが、いまは private が普通で
	 * 共有しているほうが珍しい。逆にした。
	 */
	let { visibility }: { visibility: 'private' | 'unlisted' } = $props();
</script>

{#if visibility === 'unlisted'}
	<span
		class="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-900"
		title="リンクを知っている人が見られます"
	>
		共有中
	</span>
{/if}
