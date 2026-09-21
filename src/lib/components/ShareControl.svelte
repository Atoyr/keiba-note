<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';

	/**
	 * 1メモぶんの共有スイッチ。
	 *
	 * **既定が非公開になったので、目印を付けるべきは例外のほう。**
	 * 以前は private に鍵アイコンを出していたが、いまは「共有中」を出す。
	 *
	 * 切り替えは /settings/shares の action に投げる。メモを出す画面が4つあるので、
	 * 同じ action を各画面に書くより1箇所に集約するほうが崩れにくい。
	 */
	let {
		noteId,
		visibility,
		redirectTo
	}: {
		noteId: string;
		visibility: 'private' | 'unlisted';
		redirectTo: string;
	} = $props();

	const shared = $derived(visibility === 'unlisted');

	let copied = $state(false);

	// `page.url` は SSR でも埋まっているので、location を待たずに URL を出せる。
	// 渡す相手に見せる値なので、描画のたびにちらつかせたくない。
	const url = $derived(`${page.url.origin}/notes/${noteId}`);

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// クリップボードが使えない環境では input を選ばせるだけにする。
			copied = false;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<form method="POST" action="/settings/shares" use:enhance>
		<input type="hidden" name="noteId" value={noteId} />
		<input type="hidden" name="redirect" value={redirectTo} />
		<input type="hidden" name="visibility" value={shared ? 'private' : 'unlisted'} />
		<Button type="submit" variant={shared ? 'secondary' : 'outline'} size="sm">
			{shared ? '共有をやめる' : '共有リンクを作る'}
		</Button>
	</form>

	{#if shared}
		<span
			class="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-900"
		>
			共有中
		</span>
		<input
			class="min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-700"
			value={url}
			readonly
			onfocus={(e) => e.currentTarget.select()}
		/>
		<Button type="button" variant="ghost" size="sm" onclick={copy}>
			{copied ? 'コピーしました' : 'コピー'}
		</Button>
	{/if}
</div>
