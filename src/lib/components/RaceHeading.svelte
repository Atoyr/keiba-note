<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	/**
	 * レースページの見出し。
	 *
	 * 1行目は「開催（場・R）＋レース名」で、**折り返さない**。日付は2行目の先頭に置く。
	 * 幅が足りないときに … で詰まるのはレース名だけで、開催は最後まで出す。
	 * どのレースを開いているかは開催のほうで分かるため。
	 *
	 * 重賞の札は1行目に置かない。スマホ幅だとレース名の長さ次第で札だけが
	 * 2行目に回り、見出しの高さがレースごとに変わってしまうので、
	 * はじめから2行目（スペック行）の先頭に固定する。
	 *
	 * 他の画面への導線（`links`）は、見出しの下にボタンを並べず、右端の `⋯` に畳む。
	 * 毎回は踏まない導線で、スマホ幅だと見出しの下を何行も取っていたため。
	 * レース名を押しても同じメニューを開く（`⋯` は小さく、見出しを触ったほうが早いので）。
	 */
	let {
		meeting,
		name,
		grade,
		spec,
		links
	}: {
		/** 場・R。詰めずに必ず出す部分。 */
		meeting: string;
		/** レース名。幅が足りなければここが … になる。 */
		name: string | null;
		grade: string | null;
		/** 2行目に出す日付と条件（距離・馬場など）。 */
		spec: string;
		/** `⋯` のメニューに並べる導線。省略か空ならメニューを出さない。href は呼び出し側が resolve() で組む。 */
		links?: { href: string; label: string }[];
	} = $props();

	let open = $state(false);
	let titleEl = $state<HTMLElement | null>(null);
	/**
	 * タイトルを押して開いたか。閉じたあとにフォーカスを戻す先を決める。
	 * 閉じる処理は onCloseAutoFocus を2回呼ぶので、ここでは戻さない。`⋯` で開いたとき（onOpenChange）に下ろす。
	 */
	let openedFromTitle = false;

	function toggleFromTitle() {
		if (!open) openedFromTitle = true;
		open = !open;
	}

	// タイトルから開いたときは、閉じたらタイトルへ戻す。`⋯` から開いたときは既定（`⋯` へ戻る）のまま。
	function focusBack(e: Event) {
		if (!openedFromTitle) return;
		e.preventDefault();
		titleEl?.focus();
	}
</script>

{#snippet titleText()}
	<span class="shrink-0">{meeting}</span>
	{#if name}
		<span class="truncate" title={name}>{name}</span>
	{/if}
{/snippet}

{#snippet subline()}
	{#if grade || spec}
		<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
			<GradeBadge {grade} />
			{#if spec}
				<span class="truncate">{spec}</span>
			{/if}
		</p>
	{/if}
{/snippet}

{#if links && links.length > 0}
	<div>
		<div class="flex items-start gap-2">
			<DropdownMenu.Root bind:open onOpenChange={(o) => o && (openedFromTitle = false)}>
				<div class="min-w-0 flex-1">
					<!-- 見た目は links が無いときの h1 のまま（Button の高さ・余白・字を打ち消す）。 -->
					<h1>
						<Button
							bind:ref={titleEl}
							variant="ghost"
							aria-haspopup="menu"
							aria-expanded={open}
							onclick={toggleFromTitle}
							class="h-auto w-full min-w-0 items-baseline justify-start gap-2 border-0 p-0 text-left text-lg font-bold tracking-tight hover:bg-transparent hover:underline aria-expanded:bg-transparent sm:text-xl dark:hover:bg-transparent"
						>
							{@render titleText()}
						</Button>
					</h1>
					{@render subline()}
				</div>

				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label="レースのメニュー"
							class="shrink-0"
						>
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="end" class="w-48" onCloseAutoFocus={focusBack}>
					{#each links as link (link.href)}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href は呼び出し側が resolve() で組んだもの -->
								<a href={link.href} {...props}>{link.label}</a>
							{/snippet}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
		<!-- JS が無いと `⋯` もタイトルも開かない。同じ導線を、見出しの下のボタンとして出す。 -->
		<noscript>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each links as link (link.href)}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href は呼び出し側が resolve() で組んだもの -->
					<Button href={link.href} variant="outline" size="sm">{link.label}</Button>
				{/each}
			</div>
		</noscript>
	</div>
{:else}
	<div>
		<h1 class="flex items-baseline gap-2 text-lg font-bold tracking-tight sm:text-xl">
			{@render titleText()}
		</h1>
		{@render subline()}
	</div>
{/if}
