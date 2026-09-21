<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { isAdmin } from '$lib/utils/role';

	/**
	 * ヘッダ右端のアカウントメニュー。
	 *
	 * 右側に横並びになっていたもの（共有中・管理・ユーザー名・ログアウト）を
	 * アバター1つに畳む。ヘッダに出しっぱなしにする価値があるのは毎回踏む導線
	 * （今週・レース・馬）だけで、残りは「自分まわり」の設定だから。
	 */
	let {
		user,
		canLogout
	}: {
		// $lib/server/auth/session の SessionUser は server 限定なので型は使えない。
		// 要るのは表示に使う3つだけなので構造だけ受ける（isAdmin と同じ考え）。
		user: { displayName: string; avatarUrl: string | null; role: string };
		/** モック認証中はセッションが無いのでログアウトできない。項目ごと隠す。 */
		canLogout: boolean;
	} = $props();

	// 画像を持たないアカウント（モックユーザー、picture の無い Google アカウント）
	// では頭文字を出す。サロゲートペアで割らないよう配列に開いてから取る。
	const initial = $derived([...user.displayName][0] ?? '?');

	// ログアウトは POST。項目そのものを <button type="submit"> にすると、
	// 選択でメニューが閉じるときにボタンごと DOM から外れて送信が飛ばないことがある。
	// メニューの外にフォームを置き、onSelect から requestSubmit() で叩く。
	let logoutForm = $state<HTMLFormElement | null>(null);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
		aria-label="アカウントメニュー"
	>
		<Avatar.Root>
			{#if user.avatarUrl}
				<!-- Google のプロフィール画像。どのページから取りに行ったかを
				     画像ホストに渡さない。 -->
				<Avatar.Image src={user.avatarUrl} alt="" referrerpolicy="no-referrer" />
			{/if}
			<Avatar.Fallback>{initial}</Avatar.Fallback>
		</Avatar.Root>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-48">
		<DropdownMenu.Item class="block truncate">
			{#snippet child({ props })}
				<a href={resolve('/settings/profile')} {...props}>{user.displayName}</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href={resolve('/settings/shares')} {...props}>共有中</a>
			{/snippet}
		</DropdownMenu.Item>
		{#if isAdmin(user)}
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a href={resolve('/settings/admin')} {...props}>管理</a>
				{/snippet}
			</DropdownMenu.Item>
		{/if}
		{#if canLogout}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={() => logoutForm?.requestSubmit()}>ログアウト</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

{#if canLogout}
	<form method="POST" action="/auth/logout" bind:this={logoutForm}></form>
{/if}
