<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// 既存行 + 余白。行の追加はクライアント側で増やせるようにしておく。
	// data.minRows は再訪で変わるので、増分だけを state に持って derive する。
	let extraRows = $state(0);
	// 行の上限は18。ただし**登録済みの頭数より少なくはしない。** 枠が決まる前の候補は
	// 18頭を超えることがあり、欄から溢れた馬は保存で「フォームから消えた」扱いになって
	// メモごと削除されてしまう（saveEntries）。
	const maxRows = $derived(Math.max(18, data.entries.length));
	const rowCount = $derived(Math.min(maxRows, data.minRows + extraRows));

	const cell = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm';
</script>

<svelte:head><title>出走馬の入力 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-5xl px-6 py-8">
	<a
		href={resolve('/races/[id]', { id: data.race.id })}
		class="text-sm text-gray-600 hover:underline"
	>
		← レースへ戻る
	</a>

	<h1 class="mt-2 text-2xl font-bold tracking-tight">出走馬の入力</h1>
	<p class="mt-1 text-sm text-gray-600">
		{data.race.date}
		{data.race.course}{data.race.raceNumber ?? ''}R
		{data.race.name ?? ''}
	</p>
	<p class="mt-2 text-sm text-gray-500">
		馬名だけ入れれば登録できます。既にいる馬は名前で引き当てます。
		馬名を空にして保存すると、その行の出走馬は削除されます（紐づくメモも消えます）。
	</p>

	{#if form?.message}
		<p
			class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<form method="POST" class="mt-6">
		<input type="hidden" name="rowCount" value={rowCount} />

		<div class="overflow-x-auto">
			<table class="w-full min-w-3xl border-separate border-spacing-y-1">
				<thead>
					<tr class="text-left text-xs text-gray-500">
						<th class="w-12 font-medium">枠</th>
						<th class="w-12 font-medium">馬番</th>
						<th class="min-w-48 font-medium">馬名 *</th>
						<th class="w-28 font-medium">騎手</th>
						<th class="w-14 font-medium">着順</th>
						<th class="w-20 font-medium">タイム</th>
						<th class="w-20 font-medium">着差</th>
						<th class="w-16 font-medium">上り3F</th>
						<th class="w-14 font-medium">人気</th>
					</tr>
				</thead>
				<tbody>
					{#each { length: rowCount }, i (i)}
						{@const e = data.entries[i]}
						<tr>
							<td
								><input
									type="number"
									name="bracket.{i}"
									min="1"
									max="8"
									value={e?.bracket ?? ''}
									class={cell}
								/></td
							>
							<td
								><input
									type="number"
									name="horseNumber.{i}"
									min="1"
									max="18"
									value={e?.horseNumber ?? ''}
									class={cell}
								/></td
							>
							<td><input name="horseName.{i}" value={e?.horseName ?? ''} class={cell} /></td>
							<td><input name="jockey.{i}" value={e?.jockey ?? ''} class={cell} /></td>
							<td
								><input
									type="number"
									name="finishPosition.{i}"
									min="1"
									max="18"
									value={e?.finishPosition ?? ''}
									class={cell}
								/></td
							>
							<td
								><input
									name="finishTime.{i}"
									placeholder="1:34.2"
									value={e?.finishTime ?? ''}
									class={cell}
								/></td
							>
							<td
								><input
									name="margin.{i}"
									placeholder="クビ"
									value={e?.margin ?? ''}
									class={cell}
								/></td
							>
							<td
								><input
									type="number"
									name="last3f.{i}"
									step="0.1"
									value={e?.last3f ?? ''}
									class={cell}
								/></td
							>
							<td
								><input
									type="number"
									name="popularity.{i}"
									min="1"
									max="18"
									value={e?.popularity ?? ''}
									class={cell}
								/></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			<button
				type="submit"
				class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/80"
			>
				保存してふりかえりへ
			</button>
			<button
				type="button"
				onclick={() => (extraRows += 3)}
				disabled={rowCount >= maxRows}
				class="text-sm text-gray-600 hover:underline disabled:text-gray-300 disabled:no-underline"
			>
				行を増やす
			</button>
		</div>
	</form>
</main>
