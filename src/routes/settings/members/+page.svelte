<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fmtDate = (unix: number) =>
		new Date(unix * 1000).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });

	const inviteUrl = (code: string) => `${location.origin}/invite/${code}`;

	function inviteStatus(i: (typeof data.invites)[number]): string {
		if (i.usedAt) return `使用済み（${i.usedByName ?? '不明'}）`;
		if (i.expiresAt * 1000 <= Date.now()) return '期限切れ';
		return `${fmtDate(i.expiresAt)} まで有効`;
	}
</script>

<svelte:head><title>メンバー — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="text-2xl font-bold tracking-tight">メンバー</h1>
	<p class="mt-1 text-sm text-gray-600">招待の発行と、参加しているメンバーの一覧。</p>

	<section class="mt-8">
		<h2 class="text-sm font-semibold text-gray-500">招待を発行する</h2>

		<form method="POST" action="?/create" use:enhance class="mt-2 flex flex-wrap gap-2">
			<input
				type="email"
				name="email"
				placeholder="宛先を固定する場合のみ（任意）"
				class="min-w-64 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
			/>
			<button
				type="submit"
				class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
			>
				発行
			</button>
		</form>

		{#if form && 'message' in form && form.message}
			<p class="mt-2 text-sm text-red-700" role="alert">{form.message}</p>
		{/if}

		{#if form && 'createdCode' in form && form.createdCode}
			<div class="mt-3 rounded-md border border-green-200 bg-green-50 p-3">
				<p class="text-sm font-medium text-green-900">招待リンクを発行しました</p>
				<p class="mt-1 text-xs text-green-800">
					このリンクは1回だけ使えます。7日で期限切れになります。
				</p>
				<code class="mt-2 block overflow-x-auto rounded bg-white px-2 py-1 text-xs">
					{inviteUrl(form.createdCode)}
				</code>
			</div>
		{/if}
	</section>

	<section class="mt-10">
		<h2 class="text-sm font-semibold text-gray-500">発行済みの招待</h2>

		{#if data.invites.length === 0}
			<p class="mt-2 text-sm text-gray-500">まだありません。</p>
		{:else}
			<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
				{#each data.invites as i (i.id)}
					<li class="flex items-center justify-between gap-4 py-3">
						<div class="min-w-0">
							<p class="truncate text-sm">{i.email ?? '（宛先指定なし）'}</p>
							<p class="text-xs text-gray-500">{inviteStatus(i)}</p>
						</div>
						{#if !i.usedAt}
							<form method="POST" action="?/revoke" use:enhance>
								<input type="hidden" name="inviteId" value={i.id} />
								<button type="submit" class="text-sm text-red-700 hover:underline">取り消す</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-10">
		<h2 class="text-sm font-semibold text-gray-500">メンバー</h2>
		<ul class="mt-2 divide-y divide-gray-200 border-y border-gray-200">
			{#each data.members as m (m.id)}
				<li class="flex items-center gap-3 py-3">
					{#if m.avatarUrl}
						<img src={m.avatarUrl} alt="" class="size-8 rounded-full" />
					{:else}
						<span class="size-8 rounded-full bg-gray-200" aria-hidden="true"></span>
					{/if}
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{m.displayName}</p>
						<p class="truncate text-xs text-gray-500">{m.email}</p>
					</div>
					<span class="text-xs text-gray-500">{m.role === 'owner' ? 'owner' : 'member'}</span>
				</li>
			{/each}
		</ul>
	</section>
</main>
