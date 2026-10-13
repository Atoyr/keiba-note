<script lang="ts">
	import { resolve } from '$app/paths';
	import TagBadges from '$lib/components/TagBadges.svelte';
	import JockeyTagBadges from '$lib/components/JockeyTagBadges.svelte';
	import type { NoteTag } from '$lib/schemas/note';
	import type { JockeyTag } from '$lib/schemas/jockey';
	import { jockeyParam } from '$lib/utils/jockey';
	let {
		horseId,
		notes,
		jockey,
		summary,
		conclusion = null,
		moreCount = 0
	}: {
		horseId: string;
		notes: { id: string; body: string; tags: NoteTag[]; occurredAt: string }[];
		jockey: string | null;
		summary: { body: string; tags: JockeyTag[] } | null;
		conclusion?: { tags: NoteTag[]; occurredAt: string } | null;
		/** ここにも各走にも出ていないメモの件数。あるときは件数と馬の画面への入口を出す。 */
		moreCount?: number;
	} = $props();
	/** 近況は新しい2件まで出す。 */
	const shownNotes = $derived(notes.slice(0, 2));
</script>

{#if notes.length > 0 || conclusion || moreCount > 0}
	<section aria-label="馬のメモ" class="rounded-lg bg-muted/50 p-3">
		<h3 class="text-sm font-semibold">馬のメモ</h3>
		{#if conclusion}<p class="mt-2 flex flex-wrap items-center gap-1 text-xs">
				前回の札（{conclusion.occurredAt}）<TagBadges tags={conclusion.tags} />
			</p>{/if}
		<ol class="mt-2 grid gap-2">
			{#each shownNotes as note (note.id)}
				<li class="border-l-2 pl-3">
					<p class="text-xs text-muted-foreground">{note.occurredAt} · 近況</p>
					{#if note.body}<p class="mt-1 line-clamp-3 text-sm break-words whitespace-pre-wrap">
							{note.body}
						</p>{/if}
					<TagBadges tags={note.tags} class="mt-1" />
				</li>
			{/each}
		</ol>
		<a
			href={resolve('/horses/[id]', { id: horseId })}
			class="mt-2 inline-flex min-h-6 items-center text-xs underline"
			>{moreCount > 0
				? `ほかに ${moreCount} 件のメモ。馬の画面で全文・編集を見る`
				: '馬の画面で全文・編集を見る'}</a
		>
	</section>
{/if}
{#if jockey && summary}
	<section aria-label="騎手のメモ" class="rounded-lg bg-muted/50 p-3">
		<h3 class="text-sm font-semibold">騎手のメモ · {jockey}</h3>
		{#if summary.body}<p class="mt-2 line-clamp-3 text-sm break-words whitespace-pre-wrap">
				{summary.body}
			</p>{/if}
		<JockeyTagBadges tags={summary.tags} class="mt-1" />
		<a
			href={resolve('/jockeys/[name]', { name: jockeyParam(jockey) })}
			class="mt-2 inline-flex min-h-6 items-center text-xs underline"
			>騎手の画面で全文・編集を見る</a
		>
	</section>
{/if}
