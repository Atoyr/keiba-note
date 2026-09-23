<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { dev } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/**
	 * 共有ページ（/notes/[id]）にはアプリの枠を出さない。
	 *
	 * **著者が開いても第三者が開いても同じページに見えること**が要件
	 * （product.md 第6章）。渡す前に自分で踏んで見え方を確かめられるのが狙いで、
	 * ログインしている人にだけヘッダーが出ると、その確認が成り立たない。
	 * 共有ページからアプリ内へ導線を出さない、という決めごととも揃う。
	 */
	const bare = $derived(page.url.pathname.startsWith('/notes/'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- 認証をモックしていることを忘れないための帯。
     本番では data.mockAuth が常に false になる（hooks.server.ts のモック分岐が
     `dev` ガードでビルドから消えるため）。`dev` は念のための二重の歯止めで、
     クライアント側の `dev` は実行時定数なのでマークアップ自体は
     バンドルに残る（描画されることはない）。 -->
{#if dev && data.mockAuth && !bare}
	<div
		class="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-1.5 text-xs text-amber-900"
	>
		<span>⚠️ 認証はモックです（ローカル開発時のみ）</span>
		<form method="POST" action="/dev/mock-user" class="flex items-center gap-1.5">
			<input type="hidden" name="redirect" value={page.url.pathname + page.url.search} />
			<span>切り替え:</span>
			<button name="as" value="admin" class="underline hover:no-underline">admin</button>
			<span aria-hidden="true">/</span>
			<button name="as" value="user" class="underline hover:no-underline">user</button>
		</form>
	</div>
{/if}

{#if data.user && !bare}
	<header class="border-b border-gray-200">
		<nav class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
			<a href={resolve('/')} class="font-bold tracking-tight">uma-memo</a>
			<a href={resolve('/this-week')} class="text-sm text-gray-600 hover:underline">今週</a>
			<a href={resolve('/races')} class="text-sm text-gray-600 hover:underline">レース</a>
			<a href={resolve('/horses')} class="text-sm text-gray-600 hover:underline">馬</a>
			<span class="flex-1"></span>
			<!-- 右側は1つだけ。共有中・管理・ユーザー名・ログアウトはこの中。 -->
			<AccountMenu user={data.user} canLogout={!data.mockAuth} />
		</nav>
	</header>
{/if}

{@render children()}
