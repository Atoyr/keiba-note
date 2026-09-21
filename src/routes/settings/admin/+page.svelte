<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fmtDate = (unix: number) =>
		new Date(unix * 1000).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
</script>

<svelte:head><title>管理 — keiba-note</title></svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<h1 class="text-xl font-bold tracking-tight">管理</h1>
	<p class="mt-1 text-sm text-gray-600">
		メンテ用の画面です。<strong>ここから他人のメモは読めません。</strong>
	</p>

	{#if form?.message}
		<p class="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
			{form.message}
		</p>
	{/if}

	<h2 class="mt-8 text-sm font-bold">ユーザー</h2>
	<ul class="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
		{#each data.users as u (u.id)}
			<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
				<span class="text-sm font-medium">{u.displayName}</span>
				<span class="text-xs text-gray-500">{u.email}</span>
				{#if u.role === 'admin'}
					<span class="rounded bg-gray-900 px-1.5 py-0.5 text-[11px] text-white">admin</span>
				{/if}
				{#if u.deletedAt}
					<span class="rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700">凍結済み</span>
				{/if}
				<span class="flex-1"></span>
				<span class="text-xs text-gray-400">{fmtDate(u.createdAt)}</span>
				{#if !u.deletedAt}
					<form
						method="POST"
						action="?/freeze"
						use:enhance={() =>
							({ update }) =>
								update()}
						onsubmit={(e) => {
							if (
								!confirm(
									`${u.displayName} を凍結します。ログインできなくなり、共有中のメモも非公開に戻ります。`
								)
							)
								e.preventDefault();
						}}
					>
						<input type="hidden" name="userId" value={u.id} />
						<Button type="submit" variant="outline" size="sm">凍結</Button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
</main>
