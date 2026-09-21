<script lang="ts">
	/**
	 * 非公開（visibility = 'private'）を示す鍵アイコン。
	 * 文字サイズに合わせて縮むよう em 基準にしてある。
	 */
	let { class: className = '' }: { class?: string } = $props();
</script>

<svg
	class="inline-block size-[1em] shrink-0 {className}"
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	aria-hidden="true"
>
	<rect x="3.25" y="7" width="9.5" height="6.75" rx="1.25" />
	<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
</svg>
