<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>ログイン — uma-memo</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
	<h1 class="text-2xl font-bold tracking-tight">uma-memo</h1>
	<p class="mt-1 text-sm text-gray-600">競馬の観戦メモを、レース単位／馬単位でふりかえる。</p>

	{#if data.errorMessage}
		<p
			class="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{data.errorMessage}
		</p>
	{/if}

	<!-- GET フォームにしているのは ?redirect= を安全に組み立てるため。
	     JS 無効でも動く、ただのトップレベル遷移。 -->
	<form method="GET" action={resolve('/auth/google')} class="mt-6">
		{#if data.redirectTo !== '/'}
			<input type="hidden" name="redirect" value={data.redirectTo} />
		{/if}
		<button
			type="submit"
			class="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2.5 font-medium hover:bg-gray-50"
		>
			<svg class="size-5" viewBox="0 0 24 24" aria-hidden="true">
				<path
					fill="#4285F4"
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
				/>
				<path
					fill="#34A853"
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
				/>
				<path
					fill="#FBBC05"
					d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
				/>
				<path
					fill="#EA4335"
					d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
				/>
			</svg>
			Google でログイン
		</button>
	</form>

	<p class="mt-6 text-xs text-gray-500">
		Google アカウントがあればそのまま使えます。書いたメモは既定で非公開で、
		共有したいものだけリンクを発行して渡します。
	</p>

	<!-- Google の同意画面が求める、ホームページからポリシーへのリンク（docs/operations.md）。 -->
	<p class="mt-4 flex gap-4 text-xs text-gray-500">
		<a href={resolve('/terms')} class="underline hover:no-underline">利用規約</a>
		<a href={resolve('/privacy')} class="underline hover:no-underline">プライバシーポリシー</a>
	</p>
</main>
