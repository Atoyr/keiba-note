<script lang="ts">
	import './layout.css';
	import { onMount, tick } from 'svelte';
	import { dev } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import AppEnvMark from '$lib/components/AppEnvMark.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { replayEarlyInput, resetEarlyInput, takeEarlyInput } from '$lib/utils/early-input';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/**
	 * hydration の前に書かれた入力を書き戻し、済んだ印を立てる。
	 *
	 * **済む前に入力欄へ書いた値は、hydration が SSR の値で上書きする**
	 * （Svelte 5 は `<textarea>{値}</textarea>` を `.value` の代入で合わせにいく）。
	 * `src/app.html` が覚えておいた入力を、ここで書き戻す（→ `$lib/utils/early-input`）。
	 *
	 * 先に触った欄を SSR の値に揃え、`tick()` を待ってから書き戻す。`DraftKeeper` が
	 * 「保存済みの値」を DOM から読むのがその間（フォームを `bind:this` で受けてから読むので、
	 * onMount の時点ではまだ読んでいない）。揃えずに読ませたり、読む前に書き戻したりすると、
	 * 書いた値が保存済みとして読まれ、未保存に数えられない。
	 * tick はマイクロタスクなので、その間にユーザーの入力は挟まらない。
	 *
	 * 印（`<html data-hydrated>`）は E2E が入力の前に待つ（e2e/hydration.ts）。
	 */
	onMount(async () => {
		const early = takeEarlyInput();
		resetEarlyInput(early);
		await tick();
		replayEarlyInput(early);
		document.documentElement.dataset.hydrated = '';
	});

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

<AppEnvMark staging={data.staging} />

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

<!-- 「保存しました」などの一時的な知らせ。下の中央に出す（保存ボタンを押した指の近く）。
     保存が通ると保存ボタン（SaveBar）は消えるので、ボタンと重ならない。
     **theme はライトに固定する。** 渡さないと ui/sonner が mode-watcher の mode.current を読み、
     OS がダークの端末ではダークのトーストが出たうえ、<html> の color-scheme まで dark に書き換わる
     （このアプリはライトだけ）。渡せば後ろの {...restProps} が勝ち、mode.current は読まれない。
     richColors は使わない。成功の緑の文字が背景に対して 4.5:1 に届かない。 -->
<Toaster position="bottom-center" theme="light" />
