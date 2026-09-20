<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if data.user}
	<header class="border-b border-gray-200">
		<nav class="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
			<a href={resolve('/')} class="font-bold tracking-tight">keiba-note</a>
			<span class="flex-1"></span>
			{#if data.user.role === 'owner'}
				<a href={resolve('/settings/members')} class="text-sm text-gray-600 hover:underline"
					>メンバー</a
				>
			{/if}
			<span class="text-sm text-gray-600">{data.user.displayName}</span>
			<form method="POST" action="/auth/logout">
				<button type="submit" class="text-sm text-gray-600 hover:underline">ログアウト</button>
			</form>
		</nav>
	</header>
{/if}

{@render children()}
