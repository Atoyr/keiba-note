<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Share2 from '@lucide/svelte/icons/share-2';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RaceSummary from '$lib/components/RaceSummary.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { hasSummary } from '$lib/utils/race-summary';
	import { shareLink, type ShareOutcome } from '$lib/utils/share-link';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let pending = $state(false);
	let copyMessage = $state('');
	let deviceMessage = $state('');
	let retryDeviceShare = $state(false);
	let shareSection = $state<HTMLElement>();
	const shareUrl = $derived(
		data.shareId ? `${page.url.origin}${resolve('/shared/races/[id]', { id: data.shareId })}` : ''
	);
	const shareTitle = $derived(
		`${data.summary.race.name ?? data.summary.race.meeting} 予想まとめ — uma-memo`
	);
	function showOutcome(outcome: ShareOutcome) {
		retryDeviceShare = outcome === 'retry';
		const messages: Record<ShareOutcome, string> = {
			shared: '共有画面を開きました。リンクは引き続き使えます。',
			cancelled: '共有画面を閉じました。リンクは共有できる状態です。',
			copied: '共有リンクをコピーしました。投稿先に貼り付けてください。',
			manual: '共有リンクを用意しました。「リンクをコピー」かリンク欄の選択でコピーしてください。',
			retry:
				'共有リンクを用意しました。投稿先の選択を開けなかったため、「投稿先を選ぶ」を押すか、リンクをコピーしてください。'
		};
		deviceMessage = messages[outcome];
	}
	async function shareExisting() {
		if (pending || !shareUrl) return;
		pending = true;
		try {
			showOutcome(await shareLink({ title: shareTitle, url: shareUrl }));
			await tick();
			shareSection?.focus();
		} finally {
			pending = false;
		}
	}
	const submit: SubmitFunction = ({ cancel, submitter }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		const device = submitter?.getAttribute('name') === 'deviceShare';
		return async ({ result, update }) => {
			try {
				// load の再取得を待つと端末の共有に必要なユーザー操作の有効期間が切れやすい。
				const deviceOutcome =
					device && result.type === 'success' && typeof result.data?.shareId === 'string'
						? shareLink({
								title: shareTitle,
								url: `${page.url.origin}${resolve('/shared/races/[id]', { id: result.data.shareId })}`
							})
						: null;
				await update();
				await tick();
				copyMessage = '';
				deviceMessage = '';
				retryDeviceShare = false;
				if (deviceOutcome) {
					const outcome = await deviceOutcome;
					showOutcome(outcome);
					if (outcome === 'shared' || outcome === 'cancelled') submitter?.focus();
					else shareSection?.focus();
				} else shareSection?.focus();
			} finally {
				pending = false;
			}
		};
	};
	async function copy() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copyMessage = 'コピーしました';
		} catch {
			copyMessage = 'コピーできませんでした。リンク欄を選択してコピーしてください。';
		}
	}
</script>

<svelte:head
	><title>{data.summary.race.name ?? data.summary.race.meeting} 予想まとめ — uma-memo</title
	></svelte:head
>

<main class="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
	<RaceSummary summary={data.summary} authorName={data.authorName}>
		{#snippet actions()}
			<Button href={resolve('/races/[id]/preview', { id: data.raceId })} variant="outline" size="sm"
				>予想</Button
			>
			{#if hasSummary(data.summary)}
				<form method="POST" action="?/share" use:enhance={submit}>
					<Button
						type="submit"
						name="deviceShare"
						value="1"
						variant="outline"
						size="icon-sm"
						aria-disabled={pending}
						aria-busy={pending}
						aria-label={pending ? '共有リンクを準備中' : '予想をシェア'}
						title="リンクを発行してシェア"
					>
						{#if pending}
							<LoaderCircle class="motion-safe:animate-spin" aria-hidden="true" />
						{:else}
							<Share2 aria-hidden="true" />
						{/if}
					</Button>
				</form>
			{:else if data.shareId}
				<Button
					href="#share-settings"
					variant="outline"
					size="icon-sm"
					aria-label="共有リンクを確認"
					title="共有リンクを確認"><Share2 aria-hidden="true" /></Button
				>
			{/if}
		{/snippet}
	</RaceSummary>
	{#if !hasSummary(data.summary)}
		<p class="rounded-lg border p-4 text-sm text-muted-foreground">
			まだ予想がありません。「予想」から見立てや印を保存すると、ここにまとまります。
		</p>
	{/if}
	<section
		id="share-settings"
		bind:this={shareSection}
		tabindex="-1"
		aria-labelledby="share-heading"
		class="space-y-4 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-ring"
	>
		<h2 id="share-heading" class="font-semibold">この予想を共有</h2>
		<p class="text-sm text-muted-foreground">
			このページの見立て・各馬のメモ・札・印を共有します。リンクを知っている人はログインなしで見られます。
		</p>
		<p class="text-sm break-words">
			公開用の名前：<strong>{data.authorName}</strong>
			<a class="ml-2 underline" href={resolve('/settings/profile')}>名前を設定する</a>
		</p>
		<p class="text-sm text-muted-foreground">
			シェアボタンは保存済みの予想のリンクを作成・更新して、投稿先の選択を開きます。あとから予想を書き直した場合も、シェアボタンか「共有内容を更新」で反映できます。
		</p>
		{#if data.changed}<p class="text-sm font-medium">
				共有後に予想が変わっています。共有ページに反映するには、共有内容を更新してください。
			</p>{/if}
		<div class="flex flex-wrap gap-2">
			{#if hasSummary(data.summary)}
				<form method="POST" action="?/share" use:enhance={submit}>
					<Button type="submit" aria-disabled={pending}
						>{pending ? '処理中…' : data.shareId ? '共有内容を更新' : '共有リンクを作る'}</Button
					>
				</form>
			{/if}
			{#if data.shareId}
				<form method="POST" action="?/revoke" use:enhance={submit}>
					<Button type="submit" variant="outline" aria-disabled={pending}>共有をやめる</Button>
				</form>
			{/if}
		</div>
		{#if form?.message}<p role={'failed' in form ? 'alert' : 'status'} class="text-sm">
				{form.message}
			</p>{/if}
		{#if data.shareId}
			<div class="space-y-2">
				{#if deviceMessage}<p role="status" class="text-sm">{deviceMessage}</p>{/if}
				<Label for="share-url">共有リンク</Label>
				<Input id="share-url" value={shareUrl} readonly onfocus={(e) => e.currentTarget.select()} />
				<div class="flex flex-wrap gap-2">
					{#if retryDeviceShare}<Button
							type="button"
							variant="outline"
							aria-disabled={pending}
							onclick={shareExisting}>投稿先を選ぶ</Button
						>{/if}
					<Button type="button" variant="outline" onclick={copy}>リンクをコピー</Button>
					<Button variant="outline" href={resolve('/shared/races/[id]', { id: data.shareId })}
						>共有ページを確認</Button
					>
				</div>
				{#if copyMessage}<p role="status" class="text-sm">{copyMessage}</p>{/if}
			</div>
		{/if}
	</section>
</main>
